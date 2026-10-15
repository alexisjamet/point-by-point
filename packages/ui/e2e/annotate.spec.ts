import { expect, test, type Page } from "@playwright/test";
import type { MountOptions } from "./harness/host";

const MARKDOWN = [
  "# Plan",
  "",
  "First we migrate the database. Then we switch traffic, see [the runbook](https://example.com/runbook).",
  "",
  "- Keep the old cluster for a week.",
  "- Watch the error rate.",
  "",
  "```sh",
  "npm run migrate",
  "```",
].join("\n");

async function mount(page: Page, options: Partial<MountOptions> = {}) {
  await page.goto("/");
  const opts = JSON.parse(JSON.stringify({ args: { markdown: MARKDOWN }, ...options })) as unknown;
  await page.evaluate((value) => window.mount(value as MountOptions), opts);
  const frame = page.frameLocator("iframe").first();
  await expect(frame.locator(".phrase").first()).toBeVisible();
  return frame;
}

const recorded = (page: Page) => page.evaluate(() => window.recorded);

test("annotates sentences by click and sends them in document order", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await expect(frame.locator(".note textarea")).toBeFocused();
  await page.keyboard.type("Which dashboard?");

  await frame.locator(".phrase", { hasText: "First we migrate the database." }).click();
  await page.keyboard.type("Back up first.");
  await expect(frame.locator("#count")).toHaveText("2 annotations");

  await frame.locator("#remark").fill("Looks good overall.");
  await frame.locator("#send").click();

  await expect(frame.locator("#status")).toHaveText("Sent");
  expect((await recorded(page)).messages).toEqual([
    "`First we migrate the database.` Back up first.\n\n`Watch the error rate.` Which dashboard?\n\nLooks good overall.",
  ]);
  await expect(frame.locator(".note")).toHaveCount(0);
  await expect(frame.locator("#remark")).toHaveValue("");
});

test("clicking an annotated sentence returns to its note without a duplicate", async ({ page }) => {
  const frame = await mount(page);
  const sentence = frame.locator(".phrase", { hasText: "Keep the old cluster" });
  await sentence.click();
  await page.keyboard.type("Why a week?");
  await frame.locator("#remark").click();
  await sentence.click();
  await expect(frame.locator(".note")).toHaveCount(1);
  await expect(frame.locator(".note textarea")).toBeFocused();
  await expect(sentence).toHaveClass(/annotated/);
});

test("annotates a free selection with its exact text", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator("#content").evaluate((content) => {
    const text = Array.from(content.querySelectorAll(".phrase")).find((el) => el.textContent?.includes("switch traffic"))!
      .firstChild as Text;
    const start = text.data.indexOf("switch traffic");
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + "switch traffic".length);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    content.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(frame.locator(".note-quote")).toHaveText("switch traffic");
  await page.keyboard.type("When?");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect.poll(async () => (await recorded(page)).messages).toEqual(["`switch traffic` When?"]);
});

test("a code block is one annotation unit", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator("pre.phrase").click();
  await expect(frame.locator(".note-quote")).toHaveText("npm run migrate");
});

test("refuses to send nothing", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await frame.locator("#send").click();
  await expect(frame.locator("#error")).toBeVisible();
  expect((await recorded(page)).messages).toEqual([]);
});

test("links open through the host and do not open a note", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator("a", { hasText: "the runbook" }).click();
  await expect.poll(async () => (await recorded(page)).links).toEqual(["https://example.com/runbook"]);
  await expect(frame.locator(".note")).toHaveCount(0);
});

test("removing a note clears the highlight", async ({ page }) => {
  const frame = await mount(page);
  const sentence = frame.locator(".phrase", { hasText: "Watch the error rate." });
  await sentence.click();
  await frame.locator(".note-remove").click();
  await expect(frame.locator(".note")).toHaveCount(0);
  await expect(sentence).not.toHaveClass(/annotated/);
  await expect(sentence).toBeFocused();
});

test("works with the keyboard alone", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase[tabindex]").first().focus();
  await page.keyboard.press("Tab");
  await expect(frame.locator(".phrase[tabindex]").nth(1)).toBeFocused();
  await expect(frame.locator(".phrase[tabindex]").nth(1)).toHaveAttribute("aria-label", /^Annotate: First we migrate/);
  await page.keyboard.press("Enter");
  await expect(frame.locator(".note textarea")).toBeFocused();
  await page.keyboard.type("ok");
  await page.keyboard.press("Escape");
  await expect(frame.locator(".phrase[tabindex]").nth(1)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(frame.locator(".phrase[tabindex]").first()).toBeFocused();
});

test("restores drafts after a reload and clears them after sending", async ({ page }) => {
  let frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Draft reply");
  await frame.locator("#remark").fill("Draft remark");
  await page.waitForTimeout(400);

  frame = await mount(page);
  await expect(frame.locator(".note textarea")).toHaveValue("Draft reply");
  await expect(frame.locator("#remark")).toHaveValue("Draft remark");
  await frame.locator("#send").click();
  await expect(frame.locator("#status")).toBeVisible();

  frame = await mount(page);
  await expect(frame.locator(".note")).toHaveCount(0);
  await expect(frame.locator("#remark")).toHaveValue("");
});

test("an earlier widget adds a context line", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (markdown) => {
    await window.mount({ args: { markdown }, createdAt: 1000 });
    await window.mount({ args: { markdown: "A newer response." }, createdAt: 2000 });
  }, MARKDOWN);
  const older = page.frameLocator("iframe[data-index='0']");
  const newer = page.frameLocator("iframe[data-index='1']");
  await expect(newer.locator(".phrase").first()).toBeVisible();
  await older.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Still relevant?");
  await older.locator("#send").click();
  await newer.locator(".phrase").first().click();
  await page.keyboard.type("Fine.");
  await newer.locator("#send").click();
  await expect.poll(async () => (await recorded(page)).messages).toEqual([
    "(About an earlier response)\n\n`Watch the error rate.` Still relevant?",
    "`A newer response.` Fine.",
  ]);
});

test("offers a copy fallback when sending fails", async ({ page }) => {
  const frame = await mount(page, { failMessages: true });
  await frame.locator("#remark").fill("Hello");
  await frame.locator("#send").click();
  await expect(frame.locator("#error")).toBeVisible();
  await expect(frame.locator("#fallback-text")).toHaveValue("Hello");
  await expect(frame.locator("#copy")).toBeVisible();
});

test("speaks French when the host does", async ({ page }) => {
  const frame = await mount(page, { context: { locale: "fr-FR" } });
  await expect(frame.locator("#send")).toHaveText("Envoyer");
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await expect(frame.locator(".note textarea")).toHaveAttribute("placeholder", "Ta réponse ou ta question");
  await expect(frame.locator(".note-remove")).toHaveText("Retirer");
});

test("renders streamed input and enables annotation only at the end", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.mount({ args: { markdown: "One. Two." }, partials: [{ markdown: "On" }, { markdown: "One. T" }] }),
  );
  const frame = page.frameLocator("iframe").first();
  await expect(frame.locator(".phrase")).toHaveCount(2);
  await expect(frame.locator("#content")).not.toHaveClass(/streaming/);
});

test("follows the dark theme and keeps fields at 16px", async ({ page }) => {
  const frame = await mount(page, { context: { theme: "dark" } });
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  const size = await frame.locator("#remark").evaluate((el) => getComputedStyle(el).fontSize);
  expect(parseFloat(size)).toBeGreaterThanOrEqual(16);
});

test("fits a 360px wide container without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 376, height: 800 });
  const frame = await mount(page);
  const overflow = await frame.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("keeps the copy fallback hidden until a send fails", async ({ page }) => {
  const frame = await mount(page);
  await expect(frame.locator("#fallback")).toBeHidden();
  await expect(frame.locator("#error")).toBeHidden();
  await expect(frame.locator("#storage-notice")).toBeHidden();
});

for (const [name, markdown] of [
  ["a response", MARKDOWN],
  ["the diagnostic", "/point-by-point-diagnostic"],
] as const) {
  test(`the frame height settles for ${name}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate((md) => window.mount({ args: { markdown: md } }), markdown);
    const height = () => page.locator("iframe").first().evaluate((frame) => frame.getBoundingClientRect().height);
    await page.waitForTimeout(600);
    const settled = await height();
    await page.waitForTimeout(1200);
    expect(await height()).toBe(settled);
    expect(settled).toBeLessThan(2000);
  });
}
