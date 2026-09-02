import { describe, expect, it } from "vitest";
import { RRF_K, rrfFuse } from "./rrf";

describe("rrfFuse", () => {
  it("uses equal weights and k=60 with deterministic id tie-breaking", () => {
    expect(RRF_K).toBe(60);
    const fused = rrfFuse([["b", "a"], ["a"]]);
    expect(fused[0]).toEqual({ id: "a", score: 1 / (60 + 2) + 1 / (60 + 1) });
    expect(fused.map(item => item.id)).toEqual(["a", "b"]);
  });

  it("preserves a single ranking when the other list is empty", () => {
    expect(rrfFuse([[], ["c", "a", "b"]]).map(item => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("breaks equal RRF scores by clip id ascending", () => {
    const fused = rrfFuse([["z"], ["a"]]);
    expect(fused[0]?.score).toBeCloseTo(fused[1]?.score ?? 0, 10);
    expect(fused.map(item => item.id)).toEqual(["a", "z"]);
  });
});
