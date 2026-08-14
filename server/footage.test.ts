import { describe, expect, it } from "vitest";
import { DEMO_CLIPS, rankFootage, rankSimilar } from "./footage";

describe("footage retrieval", () => {
  it("ranks quiet blue night material above unrelated footage", () => {
    const results = rankFootage(DEMO_CLIPS, "quiet blue night shots");
    expect(results[0]?.clip.id).toBe(104);
    expect(results.map(result => result.clip.id)).toContain(101);
  });

  it("ranks similar colour footage when asked for a colour match", () => {
    const results = rankSimilar(DEMO_CLIPS, 101, "color");
    expect(results[0]?.clip.colors).toContain("blue");
    expect(results.map(result => result.clip.id)).toContain(104);
  });
});

