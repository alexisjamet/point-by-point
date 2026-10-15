import { expect, test, type Page } from "@playwright/test";
import type { MountOptions } from "./harness/host";

const MARKDOWN = "First point here. Second point here.\n\nAnother paragraph.";

async function mount(page: Page, options: Partial<MountOptions> = {}) {
  await page.goto("/");
  const opts = JSON.parse(JSON.stringify({ args: { markdown: MARKDOWN }, ...options })) as unknown;
  await page.evaluate((value) => window.mount(value as MountOptions), opts);
  const frame = page.frameLocator("iframe").first();
  await expect(frame.locator(".phrase").first()).toBeVisible();
  return frame;
}

test("does not open the keyboard when a note is created", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Second point here." }).tap();
  await expect(frame.locator(".note")).toHaveCount(1);
  await expect(frame.locator(".note textarea")).not.toBeFocused();
});

test("falls back to the focus mode when fullscreen is not available", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Second point here." }).tap();
  await frame.locator(".note textarea").tap();
  await expect(frame.locator("body")).toHaveClass(/focus-mode/);
  await expect(frame.locator(".phrase", { hasText: "Another paragraph." })).toBeHidden();
  await expect(frame.locator(".note-quote")).toBeVisible();
  await frame.locator(".note .note-done").tap();
  await expect(frame.locator("body")).not.toHaveClass(/focus-mode/);
  await expect(frame.locator(".phrase", { hasText: "Another paragraph." })).toBeVisible();
  await expect(frame.locator(".note")).toHaveCount(1);
});

test("asks for fullscreen when the host offers it, and returns inline on Done", async ({ page }) => {
  const frame = await mount(page, { allowFullscreen: true });
  await frame.locator(".phrase", { hasText: "First point here." }).tap();
  await expect(frame.locator("body")).toHaveClass(/sheet/);
  await expect(frame.locator(".phrase", { hasText: "Another paragraph." })).toBeHidden();
  await frame.locator(".note .note-done").tap();
  await expect(frame.locator("body")).not.toHaveClass(/sheet|focus-mode/);
  await expect.poll(async () => (await page.evaluate(() => window.recorded)).displayModes).toEqual(["fullscreen", "inline"]);
});

test("typing in a note is not mistaken for a passage selection", async ({ page }) => {
  const frame = await mount(page);
  await frame.locator(".phrase", { hasText: "Second point here." }).tap();
  const field = frame.locator(".note textarea");
  await field.tap();
  await field.pressSequentially("hello world");
  // iOS reports selections while typing (autocorrect, word selection): simulate one in the field.
  await field.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(0, 5);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.waitForTimeout(1300);
  await expect(frame.locator(".note")).toHaveCount(1);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("hello world");
});

test("the fullscreen sheet keeps the note below the host title bar", async ({ page }) => {
  const frame = await mount(page, { allowFullscreen: true, context: { platform: "mobile" } });
  await frame.locator(".phrase", { hasText: "First point here." }).tap();
  await expect(frame.locator("body")).toHaveClass(/sheet/);
  const top = await frame.locator(".note.active").evaluate((note) => note.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(100);
});
