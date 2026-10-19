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

test("annotates sentences by click, inserts them in document order, and keeps them", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await expect(frame.locator(".note textarea")).toBeFocused();
  await page.keyboard.type("Which dashboard?");

  await frame.locator(".phrase", { hasText: "First we migrate the database." }).click();
  await page.keyboard.type("Back up first.");
  await expect(frame.locator("#send")).toHaveText("Draft my reply");

  await frame.locator("#send").click();

  await expect(frame.locator("#status")).toHaveText("In your message box: read it, then send.");
  expect((await recorded(page)).messages).toEqual([
    "`First we migrate the database.` Back up first.\n\n`Watch the error rate.` Which dashboard?",
  ]);
  await expect(frame.locator(".note textarea").first()).toHaveValue("Back up first.");
  await expect(frame.locator(".note textarea").last()).toHaveValue("Which dashboard?");
  await expect(frame.locator(".phrase", { hasText: "Watch the error rate." })).toHaveClass(/annotated/);
  await expect(frame.locator("#send")).toHaveText("Draft my reply");
});

test("in ChatGPT, the button sends", async ({ page }) => {
  const frame = await mount(page, { hostName: "chatgpt" });
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Which dashboard?");
  await expect(frame.locator("#send")).toHaveText("Send");
  await frame.locator("#send").click();
  await expect(frame.locator("#status")).toHaveText("Passed to the conversation");
  await expect(frame.locator(".note textarea")).toHaveValue("Which dashboard?");
});

test("has no general remark field: every note hangs on a passage", async ({ page }) => {
  const frame = await mount(page);
  await expect(frame.locator("#remark, .remark")).toHaveCount(0);
  await expect(frame.locator("#hint")).toHaveText("Click a sentence or select a passage to annotate it.");
});

test("the sentence under the mouse gets the annotation's highlighter stroke, on all its spans", async ({ page }) => {
  const frame = await mount(page);
  const spans = frame.locator(".phrase[data-s='2']");
  expect(await spans.count()).toBeGreaterThan(1); // split around the link
  await spans.first().hover();
  for (const span of await spans.all()) await expect(span).toHaveClass(/hovered/);
  await expect(spans.first()).toHaveCSS("background-size", "100% 88%");
  await frame.locator("h1").hover();
  await expect(frame.locator(".phrase.hovered")).toHaveCount(0);
  await expect(spans.first()).toHaveCSS("background-size", "0% 88%");
});

test("clicking an annotated sentence returns to its note without a duplicate", async ({ page }) => {
  const frame = await mount(page);
  const sentence = frame.locator(".phrase", { hasText: "Keep the old cluster" });
  await sentence.click();
  await page.keyboard.type("Why a week?");
  await frame.locator("#composer").click({ position: { x: 4, y: 4 } });
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

test("a code block is copied, not annotated", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const frame = await mount(page);
  await expect(frame.locator("pre .phrase")).toHaveCount(0);
  await frame.locator("pre").click();
  await expect(frame.locator(".note")).toHaveCount(0);
  await frame.locator(".code-copy").click();
  await expect(frame.locator(".code-copy")).toHaveAttribute("data-state", "copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm run migrate");
});

test("a table cell's note goes under the table frame, and the markdown alignment holds", async ({ page }) => {
  const markdown = "| Service | Price |\n|---|--:|\n| Fly | 5 $ |\n| E2B | 150 $ |";
  const frame = await mount(page, { args: { markdown } });
  await expect(frame.locator("td", { hasText: "150 $" })).toHaveCSS("text-align", "end");
  await frame.locator(".phrase", { hasText: "E2B" }).click();
  await expect(frame.locator(".table-wrap + .note-slot .note")).toHaveCount(1);
  await expect(frame.locator(".table-wrap .note")).toHaveCount(0);
});

test("Send stays hidden and the hint shown until a note has text", async ({ page }) => {
  const frame = await mount(page);
  await expect(frame.locator("#send")).toBeHidden();
  await expect(frame.locator("#hint")).toBeVisible();
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await expect(frame.locator("#send")).toBeHidden();
  await page.keyboard.type("Why?");
  await expect(frame.locator("#send")).toBeVisible();
  await expect(frame.locator("#send")).toBeEnabled();
  await expect(frame.locator("#hint")).toBeHidden();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(frame.locator("#send")).toBeHidden();
  await expect(frame.locator("#hint")).toBeVisible();
  // Cmd/Ctrl+Enter sends nothing either.
  await page.keyboard.press("ControlOrMeta+Enter");
  expect((await recorded(page)).messages).toEqual([]);
});

test("links open through the host and do not open a note", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator("a", { hasText: "the runbook" }).click();
  await expect.poll(async () => (await recorded(page)).links).toEqual(["https://example.com/runbook"]);
  await expect(frame.locator(".note")).toHaveCount(0);
});

test("a note opens a new conversation prefilled with its passage and its text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Which dashboard?");
  const button = frame.locator(".note-newchat");
  await expect(button).toHaveAttribute("title", "New conversation about this passage");
  await button.click();

  await expect.poll(async () => (await recorded(page)).links.length).toBe(1);
  const [link] = (await recorded(page)).links;
  const url = new URL(link!);
  expect(`${url.origin}${url.pathname}`).toBe("https://claude.ai/new");
  expect(url.searchParams.get("q")).toBe("About this passage:\n\n> Watch the error rate.\n\nWhich dashboard?");
  // The text is also copied, for hosts that confirm the link and then open nothing (Claude Desktop).
  await expect(frame.locator("#error")).toHaveText("Also copied: if no conversation opened, start a new one and paste.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "About this passage:\n\n> Watch the error rate.\n\nWhich dashboard?",
  );
  // The note stays, and nothing is sent to the current conversation.
  await expect(frame.locator(".note textarea")).toHaveValue("Which dashboard?");
  expect((await recorded(page)).messages).toEqual([]);
});

test("in Claude Desktop, the new conversation button copies the text and opens no link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const frame = await mount(page, { context: { platform: "desktop" } });
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Which dashboard?");
  const button = frame.locator(".note-newchat");
  await expect(button).toHaveAttribute("title", "Copy for a new conversation about this passage");
  await button.click();

  await expect(frame.locator("#error")).toHaveText("Copied: start a new conversation and paste.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "About this passage:\n\n> Watch the error rate.\n\nWhich dashboard?",
  );
  expect((await recorded(page)).links).toEqual([]);
});

test("removing a note clears the highlight", async ({ page }) => {
  const frame = await mount(page);
  const sentence = frame.locator(".phrase", { hasText: "Watch the error rate." });
  await sentence.click();
  // Remove is the cross in the note's top right corner.
  const note = await frame.locator(".note").boundingBox();
  const cross = await frame.locator(".note-remove").boundingBox();
  expect(cross!.x + cross!.width).toBeGreaterThan(note!.x + note!.width - 16);
  expect(cross!.y).toBeLessThan(note!.y + 16);
  await frame.locator(".note-remove").click();
  await expect(frame.locator(".note")).toHaveCount(0);
  await expect(sentence).not.toHaveClass(/annotated/);
  await expect(sentence).toBeFocused();
});

test("the quote never runs under the buttons in the note's corner", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "First we migrate the database." }).click();
  const quote = await frame.locator(".note-quote").boundingBox();
  const newChat = await frame.locator(".note-newchat").boundingBox();
  expect(quote!.x + quote!.width).toBeLessThanOrEqual(newChat!.x);
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

test("restores drafts after a reload, also after sending", async ({ page }) => {
  let frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Draft reply");
  await page.waitForTimeout(400);

  frame = await mount(page);
  await expect(frame.locator(".note textarea")).toHaveValue("Draft reply");
  await frame.locator("#send").click();
  await expect(frame.locator("#status")).toBeVisible();

  frame = await mount(page);
  await expect(frame.locator(".note textarea")).toHaveValue("Draft reply");
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
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Hello");
  await frame.locator("#send").click();
  await expect(frame.locator("#error")).toBeVisible();
  await expect(frame.locator("#fallback-text")).toHaveValue("`Watch the error rate.` Hello");
  await expect(frame.locator("#copy")).toBeVisible();
});

test("speaks French when the host does", async ({ page }) => {
  const frame = await mount(page, { context: { locale: "fr-FR" } });
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await expect(frame.locator(".note textarea")).toHaveAttribute("placeholder", "Ta réponse ou ta question");
  await expect(frame.locator(".note-remove")).toHaveText("Retirer");
  await expect(frame.locator(".note-remove")).toHaveAttribute("title", "Retirer");
  await expect(frame.locator(".note-done")).toHaveText("Valider");
  await page.keyboard.type("Pourquoi ?");
  await expect(frame.locator("#send")).toHaveText("Préparer ma réponse");
  await frame.locator(".phrase", { hasText: "Keep the old cluster" }).click();
  await page.keyboard.type("Combien ?");
  await expect(frame.locator("#send")).toHaveText("Préparer ma réponse");
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
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  const size = await frame.locator(".note textarea").evaluate((el) => getComputedStyle(el).fontSize);
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

test("the diagnostic sends a fresh report", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.mount({ args: { markdown: "/point-by-point-diagnostic" }, allowFullscreen: true }));
  const frame = page.frameLocator("iframe").first();
  await frame.getByRole("button", { name: "Request fullscreen" }).click();
  await expect(frame.locator(".diagnostic-output")).toContainText('"mode":"fullscreen"');
  await frame.getByRole("button", { name: "Send" }).click();
  await expect.poll(async () => (await page.evaluate(() => window.recorded)).messages.length).toBe(1);
  const [report] = (await page.evaluate(() => window.recorded)).messages;
  expect(report).toMatch(/^Point-by-point diagnostic\n\n```json\n/);
  expect(report).toMatch(/"minHeight": \d+/);
  expect(report).toContain('"availableDisplayModes": [\n    "inline",\n    "fullscreen"\n  ]');
});

test("after a send, a changed note clears the status and the button sends again", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Watch the error rate." }).click();
  await page.keyboard.type("Which dashboard?");
  await frame.locator("#send").click();
  await expect(frame.locator("#status")).toBeVisible();
  await expect(frame.getByRole("button", { name: "Restore notes" })).toHaveCount(0);

  await frame.locator(".note textarea").fill("Which dashboard? The new one?");
  await expect(frame.locator("#status")).toBeHidden();
  await frame.locator("#send").click();
  await expect.poll(async () => (await recorded(page)).messages).toEqual([
    "`Watch the error rate.` Which dashboard?",
    "`Watch the error rate.` Which dashboard? The new one?",
  ]);
});

for (const args of [
  { markdown: "/point-by-point-diagnostic", title: "Diagnostic" },
  { markdown: "`/point-by-point-diagnostic`" },
]) {
  test(`opens the diagnostic for ${JSON.stringify(args)}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate((value) => window.mount({ args: value }), args);
    const frame = page.frameLocator("iframe").first();
    await expect(frame.locator(".diagnostic-output")).toBeVisible();
    await expect(frame.locator("#composer")).toBeHidden();
  });
}
