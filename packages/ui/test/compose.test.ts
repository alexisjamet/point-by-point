import { describe, expect, it } from "vitest";
import { compose, sanitizeQuote } from "../src/compose";

describe("compose", () => {
  it("formats annotations in document order", () => {
    const message = compose([
      { quote: "Second sentence.", text: "reply 2", order: 40 },
      { quote: "First sentence.", text: "reply 1", order: 3 },
    ]);
    expect(message).toBe("`First sentence.` reply 1\n\n`Second sentence.` reply 2");
  });

  it("skips empty annotations", () => {
    const message = compose([
      { quote: "Kept.", text: "yes", order: 1 },
      { quote: "Dropped.", text: "   ", order: 2 },
    ]);
    expect(message).toBe("`Kept.` yes");
  });

  it("replaces backticks in quotes and normalises spaces", () => {
    expect(sanitizeQuote("Run `npm   test`\n now")).toBe("Run 'npm test' now");
    expect(compose([{ quote: "a `b` c", text: "ok", order: 0 }])).toBe("`a 'b' c` ok");
  });

  it("returns an empty string when there is nothing to send", () => {
    expect(compose([{ quote: "x", text: "  ", order: 0 }])).toBe("");
  });

  it("keeps multi-line replies and keeps creation order for equal positions", () => {
    const message = compose([
      { quote: "Same.", text: "first", order: 5 },
      { quote: "Same.", text: "second\nline", order: 5 },
    ]);
    expect(message).toBe("`Same.` first\n\n`Same.` second\nline");
  });

  it("prepends the context line for an earlier response", () => {
    const message = compose([{ quote: "Point.", text: "back to this", order: 0 }], {
      contextLine: "(About an earlier response)",
    });
    expect(message).toBe("(About an earlier response)\n\n`Point.` back to this");
  });

  it("adds no context line when nothing is sent", () => {
    expect(compose([], { contextLine: "(About an earlier response)" })).toBe("");
  });
});
