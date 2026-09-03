import { describe, expect, it } from "vitest";
import { buildCanonicalEmbeddingText } from "./canonicalText";
import {
  EVAL_GOLD_VERSION,
  EVAL_LANGUAGE_SLICES,
  languageSliceFor,
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

  it("splits language attributes from semantic categories on example queries", () => {
    const gold = loadExampleEvalGold();
    const byId = Object.fromEntries(
      gold.queries.map(query => [query.id, query])
    );

    expect(languageSliceFor(byId["q-quiet-blue-night"]!)).toBe(
      "english-same-language"
    );
    expect(languageSliceFor(byId["q-lonely-warm-zh"]!)).toBe(
      "chinese-cross-lingual"
    );
    expect(languageSliceFor(byId["q-summer-memory-montage"]!)).toBe(
      "mixed-language"
    );
    expect(languageSliceFor(byId["q-summer-memory-zh"]!)).toBe(
      "chinese-same-language"
    );
    expect(byId["q-summer-memory-montage"]?.semanticCategories).toEqual([
      "editing-intent",
    ]);
    expect(byId["q-lonely-warm-zh"]?.semanticCategories).toEqual([
      "subjective-mood",
      "zero-lexical-overlap",
    ]);

    const slices = new Set(gold.queries.map(query => languageSliceFor(query)));
    expect([...slices]).toEqual(
      expect.arrayContaining([...EVAL_LANGUAGE_SLICES])
    );
    const languageTags = new Set([
      "english",
      "chinese",
      "mixed",
      "cross-lingual",
    ]);
    expect(
      gold.queries.some(query =>
        query.semanticCategories.some(category => languageTags.has(category))
      )
    ).toBe(false);
  });

  it("keeps syn-quiet-summer-zh as an A1 lexical overlap fixture, not bilingual Metadata V2", () => {
    const gold = loadExampleEvalGold();
    const clip = gold.clips.find(item => item.id === "syn-quiet-summer-zh");
    const query = gold.queries.find(item => item.id === "q-summer-memory-zh");
    expect(clip?.metadataV2.description).toMatch(/[A-Za-z]/);
    expect(clip?.metadataV2.interpretation.mood).toEqual(["安静", "怀旧"]);
    expect(clip?.metadataV2.creative.editingUses).toEqual(["夏日回忆"]);
    expect(query?.queryLanguage).toBe("zh");
    expect(query?.languageRelation).toBe("same-language");
    expect(query?.text).not.toMatch(/[a-z0-9]/i);
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
              queryLanguage: "en",
              languageRelation: "same-language",
              semanticCategories: ["exact-factual"],
              judgments: [{ clipId: "missing-clip", grade: 3 }],
            },
          ],
        }
      )
    ).toThrow(/unknown clip missing-clip/);
  });

  it("rejects language tags stored as semantic categories", () => {
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
            {
              id: "q-legacy-language-tag",
              text: "quiet blue night shots extra",
              queryLanguage: "en",
              languageRelation: "same-language",
              semanticCategories: ["english"],
              judgments: [{ clipId: gold.clips[0]!.id, grade: 1 }],
            },
          ],
        }
      )
    ).toThrow(/semanticCategories\[0\] is invalid/);
  });
});
