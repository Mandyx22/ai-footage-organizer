import type { ClipMetadataV2 } from "./footage";

export const CANONICAL_TEXT_VERSION = "semantic-v1" as const;

type CanonicalField = { label: string; value: string | string[] };

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

function line(label: string, formatted: string) {
  if (isOmitted(formatted)) return "";
  return `${label}: ${formatted}`;
}

function section(header: string, lines: string[]) {
  const body = lines.filter(Boolean);
  if (body.length === 0) return [];
  return [header, ...body];
}

/** Semantic-v1 field mapping shared by render and content-value extraction. */
function semanticV1ObservedFields(metadata: ClipMetadataV2): CanonicalField[] {
  return [
    { label: "Description", value: metadata.description },
    { label: "Visible facts", value: metadata.observed.visibleFacts },
    { label: "Subjects", value: metadata.observed.subjects },
    { label: "Actions", value: metadata.observed.actions },
    { label: "Setting", value: metadata.observed.setting },
    { label: "Weather", value: metadata.observed.weather },
    { label: "Environment", value: metadata.observed.environmentType },
    { label: "Social context", value: metadata.observed.socialContext },
    { label: "Activity", value: metadata.observed.activityLevel },
    { label: "Visual density", value: metadata.observed.visualDensity },
    { label: "Composition", value: metadata.observed.spatialRelationships },
    { label: "Time", value: metadata.observed.time },
    { label: "Lighting", value: metadata.observed.lighting },
    { label: "Colors", value: metadata.observed.colors },
    { label: "Shot", value: metadata.observed.shotType },
    { label: "Camera motion", value: metadata.observed.cameraMotion },
  ];
}

function semanticV1InterpretationFields(
  metadata: ClipMetadataV2
): CanonicalField[] {
  return [
    { label: "Mood", value: metadata.interpretation.mood },
    { label: "Atmosphere", value: metadata.interpretation.atmosphere },
    {
      label: "Scene interpretation",
      value: metadata.interpretation.sceneInterpretation,
    },
  ];
}

function semanticV1CreativeFields(metadata: ClipMetadataV2): CanonicalField[] {
  return [{ label: "Editing uses", value: metadata.creative.editingUses }];
}

function semanticV1Fields(metadata: ClipMetadataV2): CanonicalField[] {
  return [
    ...semanticV1ObservedFields(metadata),
    ...semanticV1InterpretationFields(metadata),
    ...semanticV1CreativeFields(metadata),
  ];
}

/**
 * Formatted nonempty / non-`unknown` semantic-v1 content values (no labels).
 * Arrays are joined with `, `. Omits interpretation.uncertainty (semantic-v1).
 */
export function canonicalEmbeddingContentValues(
  metadata: ClipMetadataV2
): string[] {
  const fields = semanticV1Fields(metadata);
  const values: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const text = formatValue(fields[i]!.value);
    if (isOmitted(text)) continue;
    values.push(text);
  }
  return values;
}

export function buildCanonicalEmbeddingText(metadata: ClipMetadataV2): string {
  const observed = semanticV1ObservedFields(metadata);
  const interpretation = semanticV1InterpretationFields(metadata);
  const creative = semanticV1CreativeFields(metadata);
  const observedLines: string[] = [];
  for (let i = 0; i < observed.length; i++) {
    const field = observed[i]!;
    observedLines.push(line(field.label, formatValue(field.value)));
  }
  const interpretationLines: string[] = [];
  for (let i = 0; i < interpretation.length; i++) {
    const field = interpretation[i]!;
    interpretationLines.push(line(field.label, formatValue(field.value)));
  }
  const creativeLines: string[] = [];
  for (let i = 0; i < creative.length; i++) {
    const field = creative[i]!;
    creativeLines.push(line(field.label, formatValue(field.value)));
  }
  return [
    ...section("[OBSERVED]", observedLines),
    ...section("[INTERPRETATION — subjective]", interpretationLines),
    ...section("[CREATIVE — suggested use]", creativeLines),
  ].join("\n");
}
