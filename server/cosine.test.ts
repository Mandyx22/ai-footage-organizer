import { describe, expect, it } from "vitest";
import { cosineSimilarity, l2Normalize, rankByCosine } from "./cosine";

describe("cosine ranking", () => {
  it("L2-normalizes before the dot product, so scale does not matter", () => {
    expect(l2Normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(cosineSimilarity([3, 4], [6, 8])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 2])).toBeCloseTo(0, 10);
  });

  it("treats a zero vector as cosine 0 and does not mutate inputs", () => {
    const zero = [0, 0];
    const other = [1, 0];
    expect(cosineSimilarity(zero, other)).toBe(0);
    expect(zero).toEqual([0, 0]);
    expect(other).toEqual([1, 0]);
  });

  it("ranks every item with no similarity threshold and breaks ties by id", () => {
    const ranked = rankByCosine(
      [1, 0],
      [
        { id: "b", vector: [1, 0] },
        { id: "a", vector: [1, 0] },
        { id: "c", vector: [-1, 0] },
      ]
    );

    expect(ranked.map(item => item.id)).toEqual(["a", "b", "c"]);
    expect(ranked[0]?.cosine).toBeCloseTo(1, 10);
    expect(ranked[2]?.cosine).toBeCloseTo(-1, 10);
  });

  it("rejects mismatched dimensions", () => {
    expect(() => cosineSimilarity([1], [1, 0])).toThrow(/dimension mismatch/);
  });
});
