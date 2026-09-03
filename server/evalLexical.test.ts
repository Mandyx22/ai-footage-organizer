import { describe, expect, it } from "vitest";
import { queryTokensMultilingual, rankFootageA1 } from "./evalLexical";
import { loadExampleEvalGold, type EvalClip } from "./evalGold";
import { metadataV2ToLegacy, rankFootage, type FootageClip } from "./footage";

function toFootage(clips: EvalClip[]): FootageClip[] {
  return clips.map((clip, index) => ({
    id: index + 1,
    projectIds: [],
    fileName: `${clip.id}.mov`,
    durationMs: 0,
    thumbnailUrl: null,
    mediaUrl: null,
    status: "ready",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    ...metadataV2ToLegacy(clip.metadataV2),
    metadataJson: clip.metadataV2,
  }));
}

describe("A1 multilingual lexical tokenizer", () => {
  it("keeps latin tokens and adds CJK unigrams and bigrams", () => {
    expect(queryTokensMultilingual("quiet blue night shots")).toEqual([
      "quiet",
      "blue",
      "night",
      "shots",
    ]);
    expect(queryTokensMultilingual("安静夏日")).toEqual([
      "安",
      "静",
      "夏",
      "日",
      "安静",
      "静夏",
      "夏日",
    ]);
    expect(
      queryTokensMultilingual("适合做一个安静夏日回忆 montage 的素材")
    ).toEqual(
      expect.arrayContaining(["montage", "安", "静", "安静", "夏日", "回忆"])
    );
  });

  it("matches Chinese metadata overlap that A0 cannot tokenize", () => {
    const gold = loadExampleEvalGold();
    const footage = toFootage(gold.clips);
    const evalId = (numericId: number) =>
      gold.clips[numericId - 1]?.id ?? String(numericId);

    const query = "适合做安静夏日回忆的素材";
    const production = rankFootage(footage, query);
    expect(production).toHaveLength(footage.length);
    expect(production.every(item => item.score === 0)).toBe(true);
    const a1 = rankFootageA1(footage, query);
    expect(a1[0]?.score).toBeGreaterThan(0);
    expect(evalId(a1[0]!.clip.id)).toBe("syn-quiet-summer-zh");
  });

  it("matches English A0 ranking for an ASCII query", () => {
    const gold = loadExampleEvalGold();
    const footage = toFootage(gold.clips);
    const query = "quiet blue night shots";
    const a0 = rankFootage(footage, query).map(item => item.clip.id);
    const a1 = rankFootageA1(footage, query).map(item => item.clip.id);
    expect(a1).toEqual(a0);
  });
});
