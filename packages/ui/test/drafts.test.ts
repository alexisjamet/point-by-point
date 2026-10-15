import { describe, expect, it } from "vitest";
import { createDraftStore, hashText } from "../src/drafts";

describe("drafts", () => {
  it("saves, loads and clears a draft", () => {
    const store = createDraftStore(window.localStorage);
    expect(store.durable).toBe(true);
    const draft = { annotations: [{ kind: "sentence" as const, sentence: 2, start: 10, end: 20, quote: "q", text: "t" }] };
    store.save("k", draft);
    expect(store.load("k")).toEqual(draft);
    store.clear("k");
    expect(store.load("k")).toBeNull();
  });

  it("loads a draft from an earlier release without its general remark", () => {
    const annotations = [{ kind: "sentence", sentence: 0, start: 0, end: 5, quote: "q", text: "t" }];
    window.localStorage.setItem("point-by-point:draft:old", JSON.stringify({ annotations, remark: "r" }));
    expect(createDraftStore(window.localStorage).load("old")).toEqual({ annotations });
  });

  it("falls back to memory when storage throws", () => {
    const broken = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    } as unknown as Storage;
    const store = createDraftStore(broken);
    expect(store.durable).toBe(false);
    const annotations = [{ kind: "selection" as const, start: 0, end: 4, quote: "kept", text: "in memory" }];
    store.save("k", { annotations });
    expect(store.load("k")?.annotations).toEqual(annotations);
  });

  it("hashes text stably", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
