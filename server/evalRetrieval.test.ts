import { describe, expect, it } from "vitest";
import { loadExampleEvalGold } from "./evalGold";
import {
  A0_EVAL_NOTE,
  formatEvalReport,
  HARNESS_NOTE,
  runFakeHarnessEval,
  runOfflineRetrievalEval,
} from "./evalRetrieval";
import { createFakeEmbeddingProvider } from "./_core/fakeEmbeddingProvider";

const QUALITY_CLAIM =
  /semantic retrieval improved|embedding beats lexical|semantic lift/i;

describe("offline retrieval eval harness", () => {
  it("separates A0 eval ranking from production zero-score fallback", async () => {
    const first = await runFakeHarnessEval();
    const second = await runFakeHarnessEval();
    const formatted = formatEvalReport(first);

    expect(first.disclaimer).toBe("fake provider — harness validation only");
    expect(first.note).toBe(HARNESS_NOTE);
    expect(first.a0EvalNote).toBe(A0_EVAL_NOTE);
    expect(first.clipCount).toBe(12);
    expect(first.queryCount).toBe(8);
    expect(formatted).toContain("fake provider — harness validation only");
    expect(formatted).toContain(A0_EVAL_NOTE);
    expect(formatted).toContain("A1 eval-only multilingual lexical");
    expect(formatted).toContain("C0 A0 + fake RRF");
    expect(formatted).toContain("C1 A1 + fake RRF");
    expect(formatted).not.toMatch(QUALITY_CLAIM);

    const lonelyWarm = first.queries.find(
      query => query.queryId === "q-lonely-warm-zh"
    );
    expect(lonelyWarm?.A0.ranking).toEqual([]);
    expect(lonelyWarm?.A0.metrics.successAt5).toBe(0);
    expect(lonelyWarm?.A0.metrics.recallAt5).toBe(0);
    expect(lonelyWarm?.C0.ranking.map(hit => hit.clipId)).toEqual(
      lonelyWarm?.B0.ranking.map(hit => hit.clipId)
    );

    const summerZh = first.queries.find(
      query => query.queryId === "q-summer-memory-zh"
    );
    expect(summerZh?.A0.ranking).toEqual([]);
    expect(summerZh?.A1.ranking[0]?.clipId).toBe("syn-quiet-summer-zh");
    expect(summerZh?.text).not.toMatch(/[a-z0-9]/i);

    const montage = first.queries.find(
      query => query.queryId === "q-summer-memory-montage"
    );
    expect(montage?.categories).toContain("mixed");
    expect(montage?.A0.ranking.some(hit => hit.score > 0)).toBe(true);

    const quietBlue = first.queries.find(
      query => query.queryId === "q-quiet-blue-night"
    );
    expect(quietBlue?.A0.ranking[0]?.clipId).toBe("demo-104");
    expect(quietBlue?.A0.ranking[0]?.score).toBeGreaterThan(0);
    expect(quietBlue?.A1.ranking.map(hit => hit.clipId)).toEqual(
      quietBlue?.A0.ranking.map(hit => hit.clipId)
    );
    expect(quietBlue?.B0.ranking).toHaveLength(first.clipCount);

    expect(
      first.queries.map(query => query.B0.ranking.map(hit => hit.clipId))
    ).toEqual(
      second.queries.map(query => query.B0.ranking.map(hit => hit.clipId))
    );
    expect(Object.keys(first.byCategory)).toEqual(
      expect.arrayContaining([
        "exact-factual",
        "subjective-mood",
        "editing-intent",
        "chinese",
        "mixed",
        "cross-lingual",
        "zero-lexical-overlap",
      ])
    );
  });

  it("refuses a non-fake provider in this harness batch", async () => {
    const gold = loadExampleEvalGold();
    const provider = createFakeEmbeddingProvider();
    await expect(
      runOfflineRetrievalEval({
        gold,
        provider: { ...provider, id: "qwen3" },
      })
    ).rejects.toThrow(/fake EmbeddingProvider/);
  });
});
