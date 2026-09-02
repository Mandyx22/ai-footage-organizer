import { describe, expect, it } from "vitest";
import { createFakeEmbeddingProvider } from "./fakeEmbeddingProvider";

describe("fake EmbeddingProvider", () => {
  const provider = createFakeEmbeddingProvider();

  it("exposes the fake identity and a stable dimension", () => {
    expect(provider.id).toBe("fake");
    expect(provider.model).toBe("fake-deterministic-v1");
    expect(provider.dimension).toBe(8);
  });

  it("returns the same vector for the same input", async () => {
    const first = await provider.embedQuery("quiet blue night shots");
    const second = await provider.embedQuery("quiet blue night shots");
    const documents = await provider.embedDocuments([
      "quiet blue night shots",
      "a different document",
    ]);

    expect(first).toEqual(second);
    expect(documents[0]).toEqual(first);
    expect(first).toHaveLength(provider.dimension);
    expect(documents[1]).not.toEqual(first);
  });
});
