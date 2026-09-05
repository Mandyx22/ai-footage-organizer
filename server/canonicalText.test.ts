import { describe, expect, it } from "vitest";
import {
  buildCanonicalEmbeddingText,
  CANONICAL_TEXT_VERSION,
} from "./canonicalText";
import * as canonicalText from "./canonicalText";
import { DEMO_CLIPS, type ClipMetadataV2 } from "./footage";

function requireCanonicalEmbeddingContentValues(): (
  metadata: ClipMetadataV2
) => string[] {
  const fn = (
    canonicalText as {
      canonicalEmbeddingContentValues?: (metadata: ClipMetadataV2) => string[];
    }
  ).canonicalEmbeddingContentValues;
  expect(typeof fn).toBe("function");
  return fn!;
}

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

describe("canonicalEmbeddingContentValues (shared semantic-v1 primitive)", () => {
  it("exports included content values without field labels under the same omit rules", () => {
    const meta = metadataV2({
      weather: ["unknown"],
      environmentType: "unknown",
      spatialRelationships: [],
      atmosphere: ["  unknown  "],
      sceneInterpretation: "",
      uncertainty: ["secret uncertainty token zxqomitunc"],
      editingUses: ["opening beat"],
    });

    const values = requireCanonicalEmbeddingContentValues()(meta);
    expect(values).toEqual(
      expect.arrayContaining([
        meta.description,
        "one person, lake, sunset",
        "person, lake",
        "sitting still",
        "lakeside",
        "alone",
        "still",
        "sparse",
        "sunset",
        "golden hour, soft",
        "gold, blue",
        "medium-wide",
        "likely static",
        "quiet, reflective",
        "opening beat",
      ])
    );
    expect(values.join(" ")).not.toMatch(/solitary lakeside pause/i);
    expect(values.some(value => /\bunknown\b/i.test(value))).toBe(false);
    expect(values.join(" ")).not.toMatch(/zxqomitunc/i);
    expect(values.join(" ")).not.toMatch(/outdoor/i);
    expect(values.join(" ")).not.toMatch(/intimate/i);
    for (const value of values) {
      expect(value).not.toMatch(
        /^(Description|Visible facts|Subjects|Mood|Atmosphere|Scene interpretation|Editing uses):/i
      );
    }

    const rendered = buildCanonicalEmbeddingText(meta);
    for (const value of values) {
      expect(rendered).toContain(value);
    }
    expect(rendered).not.toMatch(/Uncertainty:/i);
    expect(rendered).not.toMatch(/zxqomitunc/i);
    expect(rendered).not.toContain("Weather:");
    expect(rendered).not.toContain("Environment:");
    expect(rendered).not.toContain("Composition:");
    expect(rendered).not.toContain("Atmosphere:");
  });

  it("keeps description/observed/interpretation mood+atmosphere+sceneInterpretation/creative editingUses only", () => {
    const meta = metadataV2({
      description: "shared canon description token",
      mood: ["sharedmoodtoken"],
      atmosphere: ["sharedatmotoken"],
      sceneInterpretation: "sharedscenetoken",
      editingUses: ["sharededittoken"],
      uncertainty: ["must-not-appear-in-values"],
    });
    const values = requireCanonicalEmbeddingContentValues()(meta);
    const joined = values.join("\n");
    expect(joined).toContain("shared canon description token");
    expect(joined).toContain("sharedmoodtoken");
    expect(joined).toContain("sharedatmotoken");
    expect(joined).toContain("sharedscenetoken");
    expect(joined).toContain("sharededittoken");
    expect(joined).not.toContain("must-not-appear-in-values");
    expect(values).toEqual(
      requireCanonicalEmbeddingContentValues()(meta)
    );
  });
});
