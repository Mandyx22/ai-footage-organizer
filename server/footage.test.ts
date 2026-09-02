import { describe, expect, it } from "vitest";
import {
  buildProjectSuggestions,
  buildSearchDocument,
  clipAskPayload,
  DEMO_CLIPS,
  metadataV2ToLegacy,
  rankFootage,
  rankSimilar,
  toFootageClip,
  type ClipMetadataV2,
  type FootageClip,
  type ActivityLevel,
  type EnvironmentType,
  type SocialContext,
  type VisualDensity,
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
    actions: string[];
    setting: string;
    weather: string[];
    environmentType: EnvironmentType;
    socialContext: SocialContext;
    activityLevel: ActivityLevel;
    visualDensity: VisualDensity;
    spatialRelationships: string[];
    time: string;
    lighting: string[];
    colors: string[];
    mood: string[];
    atmosphere: string[];
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
      actions: overrides.actions ?? ["sitting still"],
      setting: overrides.setting ?? "lakeside",
      weather: overrides.weather ?? [],
      environmentType: overrides.environmentType ?? "outdoor",
      socialContext: overrides.socialContext ?? "alone",
      activityLevel: overrides.activityLevel ?? "low activity",
      visualDensity: overrides.visualDensity ?? "sparse",
      spatialRelationships: overrides.spatialRelationships ?? [
        "one person isolated in a wide frame",
      ],
      time: overrides.time ?? "sunset",
      lighting: overrides.lighting ?? ["warm sunset light"],
      colors: overrides.colors ?? ["gold", "blue"],
      shotType: overrides.shotType ?? "medium-wide",
      cameraMotion: overrides.cameraMotion ?? "static",
    },
    interpretation: {
      mood: overrides.mood ?? ["quiet", "reflective"],
      atmosphere: overrides.atmosphere ?? ["warm", "still"],
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

  it("keeps A0 lexical ranking ASCII-only: a pure Chinese query does not score clips", () => {
    const results = rankFootage(
      DEMO_CLIPS,
      "找一些让我感觉有点孤独但又很温暖的镜头"
    );
    expect(results).toHaveLength(DEMO_CLIPS.length);
    expect(results.map(result => result.clip.id)).toEqual(
      DEMO_CLIPS.map(clip => clip.id)
    );
    expect(
      results.every(result => result.score === 0 && result.reasons.length === 0)
    ).toBe(true);
  });

  it("ranks similar colour footage when asked for a colour match", () => {
    const results = rankSimilar(DEMO_CLIPS, 101, "color");
    expect(results[0]?.clip.colors).toContain("blue");
    expect(results.map(result => result.clip.id)).toContain(104);
  });

  it("keeps DEMO clips on Metadata V2 without inferred relationships", () => {
    expect(
      DEMO_CLIPS.every(clip => clip.metadataJson?.observed && clip.metadataJson.creative)
    ).toBe(true);
    expect(
      DEMO_CLIPS.flatMap(clip => [
        clip.description,
        ...(clip.subjects ?? []),
        ...(clip.metadataJson?.observed.subjects ?? []),
      ]).join(" ")
    ).not.toMatch(/\bfriends?\b|\bcouple\b|\bfamily\b/i);
    expect(
      new Set(DEMO_CLIPS.map(clip => clip.metadataJson?.observed.cameraMotion))
    ).toEqual(
      new Set([
        "likely tracking",
        "likely static",
        "likely handheld",
        "likely moving",
      ])
    );
  });

  it("ranks similar clips from Metadata V2 even when legacy colour fields disagree", () => {
    const reference = testClip(1, {
      colors: ["green"],
      metadataJson: metadataV2({ colors: ["blue"] }),
    });
    const match = testClip(2, {
      colors: ["red"],
      metadataJson: metadataV2({ colors: ["blue"] }),
    });

    const results = rankSimilar([reference, match], 1, "color");
    expect(results.map(result => result.clip.id)).toEqual([2]);
  });

  it("suggests quiet-in-between from likely static camera motion", () => {
    const clips = [
      testClip(1, {
        metadataJson: metadataV2({
          mood: ["energetic"],
          cameraMotion: "likely static",
          time: "afternoon",
        }),
      }),
      testClip(2, {
        metadataJson: metadataV2({
          mood: ["playful"],
          cameraMotion: "likely static",
          time: "afternoon",
        }),
      }),
    ];

    expect(
      buildProjectSuggestions(clips).map(group => group.id)
    ).toContain("quiet-in-between");
  });

  it("sends layered Metadata V2 in Ask payloads", () => {
    const payload = clipAskPayload(
      testClip(1, {
        mood: ["should not appear as a top-level fact"],
        metadataJson: metadataV2({
          description: "a person sits beside a lake at sunset",
          mood: ["quiet"],
          editingUses: ["memory montage"],
        }),
      })
    );

    expect(payload).toMatchObject({
      description: "a person sits beside a lake at sunset",
      observed: { subjects: ["person", "lake"] },
      interpretation: { mood: ["quiet"] },
      creative: { editingUses: ["memory montage"] },
    });
    expect(payload).not.toHaveProperty("possibleUses");
    expect(payload).not.toHaveProperty("mood");
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
    expect(document.observed.actions).toEqual(["sitting still"]);
    expect(document.observed.weather).toEqual([]);
    expect(document.observed.environmentType).toBe("outdoor");
    expect(document.observed.socialContext).toBe("alone");
    expect(document.observed.activityLevel).toBe("low activity");
    expect(document.observed.visualDensity).toBe("sparse");
    expect(document.observed.spatialRelationships).toEqual([
      "one person isolated in a wide frame",
    ]);
    expect(document.interpretation.atmosphere).toEqual(["warm", "still"]);
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
        actions: [],
        setting: "station",
        weather: [],
        environmentType: "unknown",
        socialContext: "unknown",
        activityLevel: "unknown",
        visualDensity: "unknown",
        spatialRelationships: [],
      },
      interpretation: {
        mood: ["quiet"],
        atmosphere: [],
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
      metadataJson: null,
    });
  });

  it("normalizes old Metadata V2 objects that lack semantic enrichment fields", () => {
    const oldMetadata = {
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
        uncertainty: [],
      },
      creative: {
        editingUses: ["memory montage"],
      },
    };
    const clip = toFootageClip({
      id: 778,
      userId: 9,
      projectId: null,
      clipKey: "clip_old_v2",
      fileName: "old-v2.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 1_200,
      status: "ready",
      storageKey: "clips/old-v2.mov",
      mediaUrl: "/manus-storage/clips/old-v2.mov",
      thumbnailKey: null,
      thumbnailUrl: null,
      description: oldMetadata.description,
      subjects: JSON.stringify(oldMetadata.observed.subjects),
      setting: oldMetadata.observed.setting,
      timeOfDay: oldMetadata.observed.time,
      lighting: JSON.stringify(oldMetadata.observed.lighting),
      colors: JSON.stringify(oldMetadata.observed.colors),
      moods: JSON.stringify(oldMetadata.interpretation.mood),
      shotType: oldMetadata.observed.shotType,
      cameraMotion: oldMetadata.observed.cameraMotion,
      possibleUses: JSON.stringify(oldMetadata.creative.editingUses),
      metadataJson: oldMetadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(clip.metadataJson?.observed.actions).toEqual([]);
    expect(clip.metadataJson?.observed.weather).toEqual([]);
    expect(clip.metadataJson?.observed.environmentType).toBe("unknown");
    expect(clip.metadataJson?.observed.socialContext).toBe("unknown");
    expect(clip.metadataJson?.observed.activityLevel).toBe("unknown");
    expect(clip.metadataJson?.observed.visualDensity).toBe("unknown");
    expect(clip.metadataJson?.observed.spatialRelationships).toEqual([]);
    expect(clip.metadataJson?.interpretation.atmosphere).toEqual([]);
    expect(buildSearchDocument(clip).observed.subjects).toEqual([
      "person",
      "lake",
    ]);
  });

  it("normalizes invalid controlled Metadata V2 values to unknown", () => {
    const clip = testClip(779, {
      metadataJson: {
        ...metadataV2(),
        observed: {
          ...metadataV2().observed,
          environmentType: "spaceship" as EnvironmentType,
          socialContext: "unlisted" as SocialContext,
          activityLevel: "frantic" as ActivityLevel,
          visualDensity: "too much" as VisualDensity,
        },
      },
    });

    expect(clip.metadataJson?.observed.environmentType).toBe("spaceship");
    const document = buildSearchDocument(clip);
    expect(document.observed.environmentType).toBe("unknown");
    expect(document.observed.socialContext).toBe("unknown");
    expect(document.observed.activityLevel).toBe("unknown");
    expect(document.observed.visualDensity).toBe("unknown");
  });
});
