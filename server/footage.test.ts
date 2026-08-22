import { describe, expect, it } from "vitest";
import {
  DEMO_CLIPS,
  metadataV2ToLegacy,
  rankFootage,
  rankSimilar,
  toFootageClip,
} from "./footage";

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

  it("projects Metadata V2 into the legacy compatibility fields", () => {
    const legacy = metadataV2ToLegacy({
      description: "a person sits beside a lake at sunset",
      observed: {
        visibleFacts: ["person seated", "lake", "sunset"],
        subjects: ["person", "lake"],
        setting: "lakeside",
        time: "sunset",
        lighting: ["warm sunset light"],
        colors: ["gold", "blue"],
        shotType: "medium-wide",
        cameraMotion: "static",
      },
      interpretation: {
        mood: ["quiet", "reflective"],
        sceneInterpretation: "a solitary lakeside pause",
        uncertainty: ["camera motion inferred from sampled frames only"],
      },
      creative: {
        editingUses: ["memory montage", "closing moment"],
      },
    });

    expect(legacy).toEqual({
      description: "a person sits beside a lake at sunset",
      subjects: ["person", "lake"],
      setting: "lakeside",
      time: "sunset",
      lighting: ["warm sunset light"],
      colors: ["gold", "blue"],
      mood: ["quiet", "reflective"],
      shotType: "medium-wide",
      cameraMotion: "static",
      possibleUses: ["memory montage", "closing moment"],
    });
  });

  it("keeps legacy clips with null Metadata V2 readable", () => {
    const clip = toFootageClip({
      id: 777,
      userId: 9,
      projectId: null,
      clipKey: "clip_legacy",
      fileName: "legacy.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 1_200,
      status: "ready",
      storageKey: "clips/legacy.mov",
      mediaUrl: "/manus-storage/clips/legacy.mov",
      thumbnailKey: null,
      thumbnailUrl: null,
      description: "A legacy clip.",
      subjects: '["person"]',
      setting: "street",
      timeOfDay: "day",
      lighting: '["daylight"]',
      colors: '["blue"]',
      moods: '["calm"]',
      shotType: "wide",
      cameraMotion: "static",
      possibleUses: '["opening"]',
      metadataJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(clip).toMatchObject({
      id: 777,
      fileName: "legacy.mov",
      subjects: ["person"],
      mood: ["calm"],
      possibleUses: ["opening"],
    });
  });
});
