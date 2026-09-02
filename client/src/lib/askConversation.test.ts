import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAskMessages, saveAskMessages } from "./askConversation";

describe("ask conversation persistence", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadAskMessages()).toEqual([]);
  });

  it("round-trips user and assistant messages in sessionStorage", () => {
    saveAskMessages([
      { role: "user", content: "What could make a strong opening?" },
      { role: "assistant", content: "Start with IMG_0532.MOV for a quiet tone." },
    ]);

    expect(loadAskMessages()).toEqual([
      { role: "user", content: "What could make a strong opening?" },
      { role: "assistant", content: "Start with IMG_0532.MOV for a quiet tone." },
    ]);
  });

  it("ignores invalid stored entries", () => {
    store.set(
      "framefind-ask-messages",
      JSON.stringify([{ role: "system", content: "hidden" }, { role: "user", content: "ok" }])
    );

    expect(loadAskMessages()).toEqual([{ role: "user", content: "ok" }]);
  });
});
