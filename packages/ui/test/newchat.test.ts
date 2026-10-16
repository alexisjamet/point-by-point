import { describe, expect, it } from "vitest";
import { MAX_URL_LENGTH, chatAppFor, newChatPrompt, newChatUrl } from "../src/newchat";

const intro = "About this passage:";

function promptOf(url: string): string {
  return new URL(url).searchParams.get("q") ?? "";
}

describe("chatAppFor", () => {
  it("picks ChatGPT from its bridge or its name, Claude otherwise", () => {
    expect(chatAppFor(undefined, true)).toBe("chatgpt");
    expect(chatAppFor("ChatGPT", false)).toBe("chatgpt");
    expect(chatAppFor("openai-apps", false)).toBe("chatgpt");
    expect(chatAppFor("Claude", false)).toBe("claude");
    expect(chatAppFor(undefined, false)).toBe("claude");
  });
});

describe("newChatPrompt", () => {
  it("quotes the passage on one line and adds the note when there is one", () => {
    expect(newChatPrompt("First we\n migrate.", "  Why first? ", intro)).toBe(
      "About this passage:\n\n> First we migrate.\n\nWhy first?",
    );
    expect(newChatPrompt("First we migrate.", "  ", intro)).toBe("About this passage:\n\n> First we migrate.");
  });
});

describe("newChatUrl", () => {
  it("opens a new conversation in the app, prefilled through q", () => {
    const claude = newChatUrl("claude", "Back it up & go?", "When?", intro);
    expect(claude.startsWith("https://claude.ai/new?q=")).toBe(true);
    expect(promptOf(claude)).toBe("About this passage:\n\n> Back it up & go?\n\nWhen?");
    expect(newChatUrl("chatgpt", "Hi.", "", intro).startsWith("https://chatgpt.com/?q=")).toBe(true);
  });

  it("shortens a long passage, never the note, to keep the link short enough", () => {
    const note = "Keep this note whole.";
    for (const passage of ["word ".repeat(5000), "é".repeat(6000), "日本語".repeat(3000)]) {
      const url = newChatUrl("claude", passage, note, intro);
      expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
      const prompt = promptOf(url);
      expect(prompt.endsWith(`…\n\n${note}`)).toBe(true);
      expect(prompt.length).toBeGreaterThan(500);
    }
  });
});
