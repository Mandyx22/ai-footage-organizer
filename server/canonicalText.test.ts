import { describe, expect, it } from "vitest";
import {
  buildCanonicalEmbeddingText,
  CANONICAL_TEXT_VERSION,
} from "./canonicalText";
import { DEMO_CLIPS, type ClipMetadataV2 } from "./footage";

function metadataV2(
  overrides: Partial<{
    description: string;
    visibleFacts: string[];
    subjects: string[];
    actions: string[];
    setting: string;
    weather: string[];
    environmentType: ClipMetadataV2["observed"]["environmentType"];
    socialContext: ClipMetadataV2["observed"]["socialContext"];
    activityLevel: ClipMetadataV2["observed"]["activityLevel"];
    visualDensity: ClipMetadataV2["observed"]["visualDensity"];
    spatialRelationships: string[];
    time: string;
    lighting: string[];
    colors: string[];
    shotType: string;
    cameraMotion: string;
    mood: string[];
    atmosphere: string[];
    sceneInterpretation: string;
    uncertainty: string[];
    editingUses: string[];
  }> = {}
): ClipMetadataV2 {
  return {
    description:
      overrides.description ?? "A person sits alone beside a lake at sunset.",
    observed: {
      visibleFacts: overrides.visibleFacts ?? ["one person", "lake", "sunset"],
      subjects: overrides.subjects ?? ["person", "lake"],
      actions: overrides.actions ?? ["sitting still"],
      setting: overrides.setting ?? "lakeside",
      weather: overrides.weather ?? [],
      environmentType: overrides.environmentType ?? "outdoor",
      socialContext: overrides.socialContext ?? "alone",
      activityLevel: overrides.activityLevel ?? "still",
      visualDensity: overrides.visualDensity ?? "sparse",
      spatialRelationships: overrides.spatialRelationships ?? [
        "one person isolated in a wide frame",
      ],
      time: overrides.time ?? "sunset",
      lighting: overrides.lighting ?? ["golden hour", "soft"],
      colors: overrides.colors ?? ["gold", "blue"],
      shotType: overrides.shotType ?? "medium-wide",
      cameraMotion: overrides.cameraMotion ?? "likely static",
    },
    interpretation: {
      mood: overrides.mood ?? ["quiet", "reflective"],
      atmosphere: overrides.atmosphere ?? ["intimate", "still"],
      sceneInterpretation:
        overrides.sceneInterpretation ?? "a solitary lakeside pause",
      uncertainty: overrides.uncertainty ?? [
        "whether this is a beach is not confirmed",
      ],
    },
    creative: {
      editingUses: overrides.editingUses ?? [
        "memory montage",
        "reflective transition",
      ],
    },
  };
}

describe("buildCanonicalEmbeddingText", () => {
  it("uses a pinned semantic-v1 version", () => {
    expect(CANONICAL_TEXT_VERSION).toBe("semantic-v1");
  });

  it("serializes Metadata V2 layers in a deterministic field order", () => {
    const text = buildCanonicalEmbeddingText(metadataV2());
    expect(text).toBe(
      [
        "[OBSERVED]",
        "Description: A person sits alone beside a lake at sunset.",
        "Visible facts: one person, lake, sunset",
        "Subjects: person, lake",
        "Actions: sitting still",
        "Setting: lakeside",
        "Environment: outdoor",
        "Social context: alone",
        "Activity: still",
        "Visual density: sparse",
        "Composition: one person isolated in a wide frame",
        "Time: sunset",
        "Lighting: golden hour, soft",
        "Colors: gold, blue",
        "Shot: medium-wide",
        "Camera motion: likely static",
        "[INTERPRETATION — subjective]",
        "Mood: quiet, reflective",
        "Atmosphere: intimate, still",
        "Scene interpretation: a solitary lakeside pause",
        "[CREATIVE — suggested use]",
        "Editing uses: memory montage, reflective transition",
      ].join("\n")
    );
    expect(buildCanonicalEmbeddingText(metadataV2())).toBe(text);
  });

  it("omits empty values, unknown enums, and uncertainty", () => {
    const text = buildCanonicalEmbeddingText(
      metadataV2({
        weather: [],
        environmentType: "unknown",
        socialContext: "unknown",
        activityLevel: "unknown",
        visualDensity: "unknown",
        spatialRelationships: [],
        cameraMotion: "unknown",
        atmosphere: [],
        sceneInterpretation: "",
        uncertainty: ["whether this is a beach is not confirmed"],
        editingUses: [],
      })
    );

    expect(text).not.toContain("Weather:");
    expect(text).not.toContain("Environment:");
    expect(text).not.toContain("Social context:");
    expect(text).not.toContain("Activity:");
    expect(text).not.toContain("Visual density:");
    expect(text).not.toContain("Composition:");
    expect(text).not.toContain("Camera motion:");
    expect(text).not.toContain("Atmosphere:");
    expect(text).not.toContain("Scene interpretation:");
    expect(text).not.toContain("[CREATIVE");
    expect(text).not.toMatch(/uncertainty/i);
    expect(text).not.toContain("beach");
    expect(text).toContain("[OBSERVED]");
    expect(text).toContain("[INTERPRETATION — subjective]");
    expect(text).toContain("Mood: quiet, reflective");
  });

  it("does not leak filename, duration, or other clip identity into the text", () => {
    const text = buildCanonicalEmbeddingText(metadataV2());
    expect(text).not.toMatch(/IMG_|fileName|duration|clipKey/i);
  });

  it("serializes every DEMO clip from Metadata V2", () => {
    for (const clip of DEMO_CLIPS) {
      expect(clip.metadataJson).toBeTruthy();
      const text = buildCanonicalEmbeddingText(clip.metadataJson!);
      expect(text.startsWith("[OBSERVED]\n")).toBe(true);
      expect(text).toContain(`Description: ${clip.metadataJson!.description}`);
      expect(text).toContain("[INTERPRETATION — subjective]");
      expect(text).toContain("[CREATIVE — suggested use]");
      expect(text).not.toMatch(/uncertainty/i);
      for (const note of clip.metadataJson!.interpretation.uncertainty) {
        expect(text).not.toContain(note);
      }
    }
  });
});
