import { describe, expect, it } from "vitest";
import { loadExampleEvalGold } from "./evalGold";
import {
  formatEvalReport,
  HARNESS_NOTE,
  runFakeHarnessEval,
  runOfflineRetrievalEval,
} from "./evalRetrieval";
import { createFakeEmbeddingProvider } from "./_core/fakeEmbeddingProvider";

const QUALITY_CLAIM =
  /semantic retrieval improved|embedding beats lexical|semantic lift/i;

describe("offline retrieval eval harness", () => {
  it("runs A0 lexical and B0 fake-embedding rankings with harness-only labeling", async () => {
    const first = await runFakeHarnessEval();
    const second = await runFakeHarnessEval();
    const formatted = formatEvalReport(first);

    expect(first.disclaimer).toBe("fake provider — harness validation only");
    expect(first.note).toBe(HARNESS_NOTE);
    expect(first.provider.id).toBe("fake");
    expect(first.canonicalTextVersion).toBe("semantic-v1");
    expect(first.clipCount).toBe(11);
    expect(first.queryCount).toBe(7);
    expect(formatted).toContain("fake provider — harness validation only");
    expect(formatted).not.toMatch(QUALITY_CLAIM);

    const lonelyWarm = first.queries.find(
      query => query.queryId === "q-lonely-warm-zh"
    );
    expect(lonelyWarm?.A0.ranking).toHaveLength(first.clipCount);
    expect(
      lonelyWarm?.A0.ranking.every(
        hit => hit.score === 0 && hit.reasons.length === 0
      )
    ).toBe(true);

    const quietBlue = first.queries.find(
      query => query.queryId === "q-quiet-blue-night"
    );
    expect(quietBlue?.A0.ranking[0]?.clipId).toBe("demo-104");
    expect(quietBlue?.A0.ranking[0]?.score).toBeGreaterThan(0);
    expect(quietBlue?.B0.ranking).toHaveLength(first.clipCount);

    expect(
      first.queries.map(query => query.B0.ranking.map(hit => hit.clipId))
    ).toEqual(
      second.queries.map(query => query.B0.ranking.map(hit => hit.clipId))
    );
    expect(Object.keys(first.byCategory).sort()).toEqual(
      [
        "atmosphere",
        "chinese",
        "cross-lingual",
        "editing-intent",
        "english",
        "exact-factual",
        "negative-compositional",
        "subjective-mood",
        "zero-lexical-overlap",
      ].sort()
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
