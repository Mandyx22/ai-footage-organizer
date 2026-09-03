import { describe, expect, it } from "vitest";
import {
  metricsForRanking,
  ndcgAtK,
  recallAtK,
  successAtK,
} from "./evalMetrics";

describe("eval metrics", () => {
  const judgments = [
    { clipId: "a", grade: 3 },
    { clipId: "b", grade: 1 },
    { clipId: "c", grade: 0 },
  ];

  it("computes recall, success, and nDCG from graded judgments", () => {
    const perfect = ["a", "b", "c"];
    expect(recallAtK(perfect, new Set(["a", "b"]), 5)).toBe(1);
    expect(successAtK(["c", "a"], new Set(["a", "b"]), 5)).toBe(1);
    expect(successAtK(["c"], new Set(["a", "b"]), 5)).toBe(0);
    expect(
      ndcgAtK(
        perfect,
        new Map([
          ["a", 3],
          ["b", 1],
        ]),
        10
      )
    ).toBeCloseTo(1, 10);

    const metrics = metricsForRanking(["b", "c", "a"], judgments);
    expect(metrics.recallAt5).toBe(1);
    expect(metrics.successAt5).toBe(1);
    expect(metrics.ndcgAt10).toBeLessThan(1);
  });

  it("returns 0 when a query has no relevant clips", () => {
    expect(recallAtK(["a"], new Set(), 5)).toBe(0);
    expect(successAtK(["a"], new Set(), 5)).toBe(0);
    expect(ndcgAtK(["a"], new Map(), 10)).toBe(0);
  });
});
