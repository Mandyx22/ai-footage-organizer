import type { ClipMetadataV2 } from "./footage";

export const CANONICAL_TEXT_VERSION = "semantic-v1" as const;

function formatValue(value: string | string[]) {
  if (Array.isArray(value)) {
    return value
      .map(item => item.trim())
      .filter(Boolean)
      .join(", ");
  }
  return value.trim();
}

function isOmitted(text: string) {
  return text.length === 0 || text === "unknown";
}

function line(label: string, value: string | string[]) {
  const text = formatValue(value);
  if (isOmitted(text)) return "";
  return `${label}: ${text}`;
}

function section(header: string, lines: string[]) {
  const body = lines.filter(Boolean);
  if (body.length === 0) return [];
  return [header, ...body];
}

export function buildCanonicalEmbeddingText(metadata: ClipMetadataV2): string {
  return [
    ...section("[OBSERVED]", [
      line("Description", metadata.description),
      line("Visible facts", metadata.observed.visibleFacts),
      line("Subjects", metadata.observed.subjects),
      line("Actions", metadata.observed.actions),
      line("Setting", metadata.observed.setting),
      line("Weather", metadata.observed.weather),
      line("Environment", metadata.observed.environmentType),
      line("Social context", metadata.observed.socialContext),
      line("Activity", metadata.observed.activityLevel),
      line("Visual density", metadata.observed.visualDensity),
      line("Composition", metadata.observed.spatialRelationships),
      line("Time", metadata.observed.time),
      line("Lighting", metadata.observed.lighting),
      line("Colors", metadata.observed.colors),
      line("Shot", metadata.observed.shotType),
      line("Camera motion", metadata.observed.cameraMotion),
    ]),
    ...section("[INTERPRETATION — subjective]", [
      line("Mood", metadata.interpretation.mood),
      line("Atmosphere", metadata.interpretation.atmosphere),
      line("Scene interpretation", metadata.interpretation.sceneInterpretation),
    ]),
    ...section("[CREATIVE — suggested use]", [
      line("Editing uses", metadata.creative.editingUses),
    ]),
  ].join("\n");
}
