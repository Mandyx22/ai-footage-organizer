import { describe, expect, it } from "vitest";
import { buildCanonicalEmbeddingText } from "./canonicalText";
import {
  EVAL_GOLD_VERSION,
  loadExampleEvalGold,
  parseEvalGold,
  REQUIRED_EVAL_QUERY_TEXTS,
} from "./evalGold";
import { DEMO_CLIPS } from "./footage";

describe("M5A eval gold harness", () => {
  it("loads demo and synthetic fixtures that cover the required queries", () => {
    const gold = loadExampleEvalGold();
    expect(gold.version).toBe(EVAL_GOLD_VERSION);
    expect(gold.purpose).toMatch(/not a retrieval-quality/i);
    expect(gold.clips.some(clip => clip.source === "demo")).toBe(true);
    expect(gold.clips.some(clip => clip.source === "synthetic")).toBe(true);
    expect(gold.queries.map(query => query.text)).toEqual(
      expect.arrayContaining([...REQUIRED_EVAL_QUERY_TEXTS])
    );
  });

  it("keeps demo eval clips aligned with DEMO_CLIPS Metadata V2", () => {
    const gold = loadExampleEvalGold();
    for (const clip of DEMO_CLIPS) {
      expect(clip.metadataJson).toBeTruthy();
      const fixture = gold.clips.find(item => item.id === `demo-${clip.id}`);
      expect(fixture?.source).toBe("demo");
      expect(fixture?.metadataV2).toEqual(clip.metadataJson);
    }
  });

  it("can build canonical embedding text for every harness clip", () => {
    const gold = loadExampleEvalGold();
    for (const clip of gold.clips) {
      const text = buildCanonicalEmbeddingText(clip.metadataV2);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/uncertainty/i);
    }
  });

  it("keeps the Chinese lonely-warm target free of those query words", () => {
    const gold = loadExampleEvalGold();
    const clip = gold.clips.find(
      item => item.id === "syn-lonely-warm-lakeside"
    );
    expect(clip).toBeTruthy();
    const blob = JSON.stringify(clip?.metadataV2);
    expect(blob).not.toMatch(/孤独|温暖/);
  });

  it("keeps the mixed montage query distinct from a pure-Chinese editing query", () => {
    const gold = loadExampleEvalGold();
    const mixed = gold.queries.find(
      query => query.id === "q-summer-memory-montage"
    );
    const pure = gold.queries.find(query => query.id === "q-summer-memory-zh");
    expect(mixed?.text).toMatch(/montage/);
    expect(mixed?.categories).toContain("mixed");
    expect(pure?.text).toBe("适合做安静夏日回忆的素材");
    expect(pure?.text).not.toMatch(/[a-z0-9]/i);
    expect(gold.clips.some(clip => clip.id === "syn-quiet-summer-zh")).toBe(
      true
    );
  });

  it("rejects judgments that point at unknown clips", () => {
    const gold = loadExampleEvalGold();
    expect(() =>
      parseEvalGold(
        {
          version: EVAL_GOLD_VERSION,
          clips: gold.clips,
        },
        {
          version: EVAL_GOLD_VERSION,
          purpose: gold.purpose,
          queries: [
            ...gold.queries,
            {
              id: "q-broken",
              text: "unused extra query",
              language: "en",
              categories: ["english"],
              judgments: [{ clipId: "missing-clip", grade: 3 }],
            },
          ],
        }
      )
    ).toThrow(/unknown clip missing-clip/);
  });
});
