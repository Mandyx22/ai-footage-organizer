import { describe, expect, it } from "vitest";
import {
  calibrationMetricsForRanking,
  metricsForRanking,
  ndcgAtK,
  precisionAtK,
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

describe("calibration metric semantics", () => {
  const judgments = [
    { clipId: "a", grade: 3 },
    { clipId: "b", grade: 1 },
    { clipId: "c", grade: 2 },
    { clipId: "d", grade: 0 },
  ];

  it("precisionAtK always divides hits by k, including short rankings", () => {
    expect(precisionAtK(["a", "x"], new Set(["a", "c"]), 5)).toBe(1 / 5);
    expect(precisionAtK(["a", "c", "x", "y", "z"], new Set(["a", "c"]), 5)).toBe(
      2 / 5
    );
    expect(precisionAtK([], new Set(["a"]), 5)).toBe(0);
  });

  it("rejects non-positive k for precisionAtK", () => {
    expect(() => precisionAtK(["a"], new Set(["a"]), 0)).toThrow(/k/i);
    expect(() => precisionAtK(["a"], new Set(["a"]), -1)).toThrow(/k/i);
  });

  it("calibrationMetricsForRanking uses grade>=2 for binary metrics and keeps grade1 in nDCG", () => {
    const ranked = ["b", "a", "c", "d"];
    const legacy = metricsForRanking(ranked, judgments);
    expect(legacy.successAt5).toBe(1);
    expect(legacy.recallAt5).toBe(1);

    const cal = calibrationMetricsForRanking(ranked, judgments, {
      includePilotCorpusRecallAt10Diagnostic: true,
    });
    expect(cal.successAt5).toBe(1);
    expect(cal.precisionAt5).toBe(2 / 5);
    expect(cal.pilotCorpusRecallAt10Diagnostic).toBe(1);
    expect(cal).not.toHaveProperty("recallAt5");
    expect(Object.keys(cal).sort()).toEqual(
      [
        "ndcgAt10",
        "pilotCorpusRecallAt10Diagnostic",
        "precisionAt5",
        "successAt5",
      ].sort()
    );

    const onlyGrade1Hit = calibrationMetricsForRanking(["b", "d"], judgments);
    expect(onlyGrade1Hit.successAt5).toBe(0);
    expect(onlyGrade1Hit.precisionAt5).toBe(0);
    expect(onlyGrade1Hit.ndcgAt10).toBeGreaterThan(0);

    const noDiagnostic = calibrationMetricsForRanking(ranked, judgments);
    expect(noDiagnostic).not.toHaveProperty("pilotCorpusRecallAt10Diagnostic");
  });

  it("keeps metricsForRanking binary threshold at grade>=1", () => {
    const metrics = metricsForRanking(["b"], [
      { clipId: "a", grade: 3 },
      { clipId: "b", grade: 1 },
    ]);
    expect(metrics.successAt5).toBe(1);
    expect(metrics.recallAt5).toBe(0.5);
  });
});
