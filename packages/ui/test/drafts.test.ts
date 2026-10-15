import { describe, expect, it } from "vitest";
import { createDraftStore, hashText } from "../src/drafts";

describe("drafts", () => {
  it("saves, loads and clears a draft", () => {
    const store = createDraftStore(window.localStorage);
    expect(store.durable).toBe(true);
    const draft = { annotations: [{ kind: "sentence" as const, sentence: 2, start: 10, end: 20, quote: "q", text: "t" }], remark: "r" };
    store.save("k", draft);
    expect(store.load("k")).toEqual(draft);
    store.clear("k");
    expect(store.load("k")).toBeNull();
  });

  it("falls back to memory when storage throws", () => {
    const broken = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    } as unknown as Storage;
    const store = createDraftStore(broken);
    expect(store.durable).toBe(false);
    store.save("k", { annotations: [], remark: "kept in memory" });
    expect(store.load("k")?.remark).toBe("kept in memory");
  });

  it("hashes text stably", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
