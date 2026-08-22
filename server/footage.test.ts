import { describe, expect, it } from "vitest";
import {
  buildSearchDocument,
  DEMO_CLIPS,
  metadataV2ToLegacy,
  rankFootage,
  rankSimilar,
  toFootageClip,
  type ClipMetadataV2,
  type FootageClip,
} from "./footage";

function testClip(
  id: number,
  metadata: Partial<FootageClip> = {}
): FootageClip {
  return {
    id,
    fileName: `clip-${id}.mov`,
    durationMs: 1_000,
    thumbnailUrl: null,
    mediaUrl: null,
    status: "ready",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    description: "",
    subjects: [],
    setting: "",
    time: "",
    lighting: [],
    colors: [],
    mood: [],
    shotType: "",
    cameraMotion: "",
    possibleUses: [],
    ...metadata,
  };
}

function metadataV2(
  overrides: Partial<{
    description: string;
    visibleFacts: string[];
    subjects: string[];
    setting: string;
    time: string;
    lighting: string[];
    colors: string[];
    mood: string[];
    shotType: string;
    cameraMotion: string;
    editingUses: string[];
    sceneInterpretation: string;
  }> = {}
): ClipMetadataV2 {
  return {
    description: overrides.description ?? "a clip-level description",
    observed: {
      visibleFacts: overrides.visibleFacts ?? ["person beside lake"],
      subjects: overrides.subjects ?? ["person", "lake"],
      setting: overrides.setting ?? "lakeside",
      time: overrides.time ?? "sunset",
      lighting: overrides.lighting ?? ["warm sunset light"],
      colors: overrides.colors ?? ["gold", "blue"],
      shotType: overrides.shotType ?? "medium-wide",
      cameraMotion: overrides.cameraMotion ?? "static",
    },
    interpretation: {
      mood: overrides.mood ?? ["quiet", "reflective"],
      sceneInterpretation:
        overrides.sceneInterpretation ?? "a solitary lakeside pause",
      uncertainty: [],
    },
    creative: {
      editingUses: overrides.editingUses ?? ["memory montage"],
    },
  };
}

describe("footage retrieval", () => {
  it("ranks quiet blue night material above unrelated footage", () => {
    const results = rankFootage(DEMO_CLIPS, "quiet blue night shots");
    expect(results[0]?.clip.id).toBe(104);
    expect(results.map(result => result.clip.id)).toContain(101);
    expect(results[0]?.reasons).toContain("mood: quiet");
  });

  it("ranks similar colour footage when asked for a colour match", () => {
    const results = rankSimilar(DEMO_CLIPS, 101, "color");
    expect(results[0]?.clip.colors).toContain("blue");
    expect(results.map(result => result.clip.id)).toContain(104);
  });

  it("projects Metadata V2 into the legacy compatibility fields", () => {
    const legacy = metadataV2ToLegacy(
      metadataV2({
        description: "a person sits beside a lake at sunset",
        visibleFacts: ["person seated", "lake", "sunset"],
        editingUses: ["memory montage", "closing moment"],
      })
    );

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

  it("builds a canonical search document from Metadata V2", () => {
    const metadata = metadataV2({
      visibleFacts: ["train window", "sunset outside"],
      sceneInterpretation: "a quiet travel memory",
    });
    const document = buildSearchDocument(
      testClip(1, {
        description: "legacy description should not win",
        metadataJson: metadata,
      })
    );

    expect(document.observed.visibleFacts).toEqual([
      "train window",
      "sunset outside",
    ]);
    expect(document.interpretation.sceneInterpretation).toBe(
      "a quiet travel memory"
    );
    expect(document.creative.editingUses).toEqual(["memory montage"]);
  });

  it("builds a canonical search document from legacy clip fields", () => {
    const document = buildSearchDocument(
      testClip(2, {
        description: "legacy quiet train clip",
        subjects: ["train"],
        setting: "station",
        time: "night",
        lighting: ["low light"],
        colors: ["blue"],
        mood: ["quiet"],
        shotType: "wide",
        cameraMotion: "static",
        possibleUses: ["transition"],
        metadataJson: null,
      })
    );

    expect(document).toMatchObject({
      description: "legacy quiet train clip",
      observed: {
        visibleFacts: [],
        subjects: ["train"],
        setting: "station",
      },
      interpretation: {
        mood: ["quiet"],
      },
      creative: {
        editingUses: ["transition"],
      },
    });
  });

  it("matches visible facts, subjects, and setting with field reasons", () => {
    const results = rankFootage(
      [
        testClip(1, {
          metadataJson: metadataV2({
            visibleFacts: ["train window"],
            subjects: ["passenger"],
            setting: "station platform",
          }),
        }),
      ],
      "train passenger station"
    );

    expect(results[0]?.score).toBeGreaterThan(0);
    expect(results[0]?.reasons).toEqual(
      expect.arrayContaining([
        "subject: passenger",
        "visible fact: train window",
        "setting: station platform",
      ])
    );
  });

  it("matches mood, lighting, color, shot, motion, and editing use fields", () => {
    const results = rankFootage(
      [
        testClip(1, {
          metadataJson: metadataV2({
            mood: ["quiet"],
            lighting: ["warm practical"],
            colors: ["amber"],
            shotType: "close-up",
            cameraMotion: "static",
            editingUses: ["transition"],
          }),
        }),
      ],
      "quiet warm amber close static transition"
    );

    expect(results[0]?.reasons).toEqual(
      expect.arrayContaining([
        "mood: quiet",
        "lighting: warm practical",
        "color: amber",
        "shot type: close-up",
      ])
    );
    expect(results[0]?.reasons.length).toBeLessThanOrEqual(4);
  });

  it("matches creative editing uses", () => {
    const results = rankFootage(
      [
        testClip(1, {
          metadataJson: metadataV2({
            description: "unrelated",
            subjects: ["window"],
            setting: "train interior",
            editingUses: ["memory montage", "reflective transition"],
          }),
        }),
      ],
      "transition"
    );

    expect(results[0]?.reasons).toContain(
      "editing use: reflective transition"
    );
  });

  it("ranks strong structured matches above description-only matches", () => {
    const structured = testClip(1, {
      metadataJson: metadataV2({
        description: "an unrelated sentence",
        subjects: ["train"],
        setting: "station",
      }),
    });
    const descriptionOnly = testClip(2, {
      description: "train train train train station station station",
      metadataJson: metadataV2({
        description: "train train train train station station station",
        subjects: ["book"],
        setting: "hotel room",
      }),
    });

    const results = rankFootage([descriptionOnly, structured], "train station");

    expect(results[0]?.clip.id).toBe(1);
  });

  it("caps description contribution", () => {
    const results = rankFootage(
      [
        testClip(1, {
          description:
            "quiet quiet blue blue night night warm warm transition transition",
        }),
      ],
      "quiet blue night warm transition"
    );

    expect(results[0]?.score).toBe(1);
    expect(results[0]?.reasons).toEqual([
      "description: quiet quiet blue blue night night warm warm transition transition",
    ]);
  });

  it("keeps synonym expansion deterministic", () => {
    const results = rankFootage(
      [
        testClip(1, { lighting: ["golden hour"], colors: ["amber"] }),
        testClip(2, { lighting: ["daylight"], colors: ["green"] }),
      ],
      "warm"
    );

    expect(results.map(result => result.clip.id)).toEqual([1]);
    expect(results[0]?.reasons).toEqual(
      expect.arrayContaining(["lighting: golden hour", "color: amber"])
    );
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
