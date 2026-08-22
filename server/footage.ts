import type { Clip } from "../drizzle/schema";

export type ClipMetadata = {
  description: string;
  subjects: string[];
  setting: string;
  time: string;
  lighting: string[];
  colors: string[];
  mood: string[];
  shotType: string;
  cameraMotion: string;
  possibleUses: string[];
};

export type ClipMetadataV2 = {
  description: string;
  observed: {
    visibleFacts: string[];
    subjects: string[];
    actions: string[];
    setting: string;
    spatialRelationships: string[];
    time: string;
    lighting: string[];
    colors: string[];
    shotType: string;
    cameraMotion: string;
  };
  interpretation: {
    mood: string[];
    atmosphere: string[];
    sceneInterpretation: string;
    uncertainty: string[];
  };
  creative: {
    editingUses: string[];
  };
};

export function metadataV2ToLegacy(metadata: ClipMetadataV2): ClipMetadata {
  return {
    description: metadata.description,
    subjects: metadata.observed.subjects,
    setting: metadata.observed.setting,
    time: metadata.observed.time,
    lighting: metadata.observed.lighting,
    colors: metadata.observed.colors,
    mood: metadata.interpretation.mood,
    shotType: metadata.observed.shotType,
    cameraMotion: metadata.observed.cameraMotion,
    possibleUses: metadata.creative.editingUses,
  };
}

export type FootageClip = ClipMetadata & {
  id: number;
  projectId?: number | null;
  fileName: string;
  durationMs: number;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  status: "uploading" | "analyzing" | "ready" | "failed";
  createdAt: Date | string;
  metadataJson?: ClipMetadataV2 | null;
};

export type CollectionSuggestion = {
  id: string;
  name: string;
  description: string;
  accent: string;
  isAiSuggested: true;
  clipCount: number;
  clipIds: number[];
};

const p = (
  id: number,
  fileName: string,
  durationMs: number,
  metadata: ClipMetadata
): FootageClip => ({
  id,
  fileName,
  durationMs,
  thumbnailUrl: null,
  mediaUrl: null,
  status: "ready",
  createdAt: new Date("2026-08-01T10:00:00Z"),
  ...metadata,
});

export const DEMO_CLIPS: FootageClip[] = [
  p(101, "IMG_4821.MOV", 8200, {
    description:
      "Two friends crossing a cobalt-blue side street under neon signs.",
    subjects: ["friends", "people"],
    setting: "city street",
    time: "night",
    lighting: ["neon", "low light"],
    colors: ["blue", "magenta"],
    mood: ["dreamy", "energetic"],
    shotType: "medium",
    cameraMotion: "handheld tracking",
    possibleUses: ["nightlife montage", "transition"],
  }),
  p(102, "DJI_0308.MP4", 14600, {
    description:
      "A quiet wide view of warm light falling through a station window.",
    subjects: ["train", "window"],
    setting: "train interior",
    time: "sunset",
    lighting: ["golden hour", "soft"],
    colors: ["amber", "cream"],
    mood: ["reflective", "calm"],
    shotType: "wide",
    cameraMotion: "static",
    possibleUses: ["opening", "day-to-night transition"],
  }),
  p(103, "IMG_4887.MOV", 6100, {
    description:
      "Steam rises from ramen bowls as friends laugh across a wooden table.",
    subjects: ["food", "friends"],
    setting: "restaurant",
    time: "night",
    lighting: ["warm practical", "low light"],
    colors: ["amber", "red"],
    mood: ["intimate", "lively"],
    shotType: "close-up",
    cameraMotion: "gentle handheld",
    possibleUses: ["food montage", "detail cutaway"],
  }),
  p(104, "IMG_4902.MOV", 12400, {
    description:
      "Rain traces luminous reflections across an almost empty city intersection.",
    subjects: ["street", "rain"],
    setting: "city street",
    time: "night",
    lighting: ["neon", "low light"],
    colors: ["blue", "violet"],
    mood: ["quiet", "lonely"],
    shotType: "wide",
    cameraMotion: "static",
    possibleUses: ["reflective opening", "transition"],
  }),
  p(105, "GOPR_1172.MP4", 9400, {
    description:
      "A sunlit cyclist moves through a tree-lined path in the morning.",
    subjects: ["cyclist", "nature"],
    setting: "park",
    time: "morning",
    lighting: ["daylight", "dappled"],
    colors: ["green", "warm yellow"],
    mood: ["free", "optimistic"],
    shotType: "medium",
    cameraMotion: "forward motion",
    possibleUses: ["travel montage", "pace lift"],
  }),
  p(106, "IMG_4938.MOV", 5300, {
    description: "Hands turn the pages of a small book beside a hotel window.",
    subjects: ["hands", "book"],
    setting: "hotel room",
    time: "afternoon",
    lighting: ["soft window light"],
    colors: ["cream", "brown"],
    mood: ["quiet", "nostalgic"],
    shotType: "close-up",
    cameraMotion: "static",
    possibleUses: ["breathing room", "detail cutaway"],
  }),
  p(107, "IMG_4951.MOV", 7600, {
    description: "Friends lean into the frame beneath a glowing shop sign.",
    subjects: ["friends", "people"],
    setting: "city street",
    time: "night",
    lighting: ["neon", "mixed"],
    colors: ["blue", "pink"],
    mood: ["playful", "energetic"],
    shotType: "close-up",
    cameraMotion: "handheld",
    possibleUses: ["nightlife montage", "memory moment"],
  }),
  p(108, "DJI_0341.MP4", 18000, {
    description:
      "A slow aerial reveal of a coastal town disappearing into dusk.",
    subjects: ["coast", "town"],
    setting: "coast",
    time: "dusk",
    lighting: ["blue hour", "soft"],
    colors: ["blue", "slate"],
    mood: ["expansive", "calm"],
    shotType: "wide",
    cameraMotion: "aerial reveal",
    possibleUses: ["establishing shot", "closing"],
  }),
];

const synonyms: Record<string, string[]> = {
  quiet: ["calm", "reflective", "still", "intimate", "lonely", "quiet"],
  blue: ["blue", "cobalt", "violet", "neon", "cool", "slate"],
  night: ["night", "dusk", "neon", "low light"],
  people: ["friends", "people", "hands", "cyclist"],
  warm: ["amber", "golden", "warm", "cream", "yellow"],
  transition: ["transition", "cutaway", "breathing room"],
  dreamy: ["dreamy", "reflective", "nostalgic", "soft"],
};

type SearchField = {
  key: string;
  label: string;
  weight: number;
  values: string[];
  maxMatches: number;
};

export type SearchMatchReason = {
  field: string;
  value: string;
};

export type RankedFootage = {
  clip: FootageClip;
  score: number;
  reasons: string[];
};

export type SearchDocument = {
  description: string;
  observed: {
    visibleFacts: string[];
    subjects: string[];
    actions: string[];
    setting: string;
    spatialRelationships: string[];
    time: string;
    lighting: string[];
    colors: string[];
    shotType: string;
    cameraMotion: string;
  };
  interpretation: {
    mood: string[];
    atmosphere: string[];
    sceneInterpretation: string;
  };
  creative: {
    editingUses: string[];
  };
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function metadataJsonAsV2(value: unknown): ClipMetadataV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as ClipMetadataV2;
  if (
    typeof metadata.description !== "string" ||
    !metadata.observed ||
    typeof metadata.observed !== "object" ||
    Array.isArray(metadata.observed) ||
    !metadata.interpretation ||
    typeof metadata.interpretation !== "object" ||
    Array.isArray(metadata.interpretation) ||
    !metadata.creative ||
    typeof metadata.creative !== "object" ||
    Array.isArray(metadata.creative)
  )
    return null;
  const hasCoreShape =
    isStringArray(metadata.observed.visibleFacts) &&
    isStringArray(metadata.observed.subjects) &&
    typeof metadata.observed.setting === "string" &&
    typeof metadata.observed.time === "string" &&
    isStringArray(metadata.observed.lighting) &&
    isStringArray(metadata.observed.colors) &&
    typeof metadata.observed.shotType === "string" &&
    typeof metadata.observed.cameraMotion === "string" &&
    isStringArray(metadata.interpretation.mood) &&
    typeof metadata.interpretation.sceneInterpretation === "string" &&
    isStringArray(metadata.interpretation.uncertainty) &&
    isStringArray(metadata.creative.editingUses);

  if (!hasCoreShape) return null;

  return {
    ...metadata,
    observed: {
      ...metadata.observed,
      actions: isStringArray(metadata.observed.actions)
        ? metadata.observed.actions
        : [],
      spatialRelationships: isStringArray(
        metadata.observed.spatialRelationships
      )
        ? metadata.observed.spatialRelationships
        : [],
    },
    interpretation: {
      ...metadata.interpretation,
      atmosphere: isStringArray(metadata.interpretation.atmosphere)
        ? metadata.interpretation.atmosphere
        : [],
    },
  };
}

export function buildSearchDocument(clip: FootageClip): SearchDocument {
  const metadata = metadataJsonAsV2(clip.metadataJson);
  if (metadata) {
    return {
      description: metadata.description,
      observed: {
        visibleFacts: metadata.observed.visibleFacts,
        subjects: metadata.observed.subjects,
        actions: metadata.observed.actions,
        setting: metadata.observed.setting,
        spatialRelationships: metadata.observed.spatialRelationships,
        time: metadata.observed.time,
        lighting: metadata.observed.lighting,
        colors: metadata.observed.colors,
        shotType: metadata.observed.shotType,
        cameraMotion: metadata.observed.cameraMotion,
      },
      interpretation: {
        mood: metadata.interpretation.mood,
        atmosphere: metadata.interpretation.atmosphere,
        sceneInterpretation: metadata.interpretation.sceneInterpretation,
      },
      creative: {
        editingUses: metadata.creative.editingUses,
      },
    };
  }

  return {
    description: clip.description,
    observed: {
      visibleFacts: [],
      subjects: clip.subjects,
      actions: [],
      setting: clip.setting,
      spatialRelationships: [],
      time: clip.time,
      lighting: clip.lighting,
      colors: clip.colors,
      shotType: clip.shotType,
      cameraMotion: clip.cameraMotion,
    },
    interpretation: {
      mood: clip.mood,
      atmosphere: [],
      sceneInterpretation: "",
    },
    creative: {
      editingUses: clip.possibleUses,
    },
  };
}

function searchFields(document: SearchDocument): SearchField[] {
  return [
    {
      key: "observed.subjects",
      label: "subject",
      weight: 4,
      values: document.observed.subjects,
      maxMatches: 2,
    },
    {
      key: "observed.visibleFacts",
      label: "visible fact",
      weight: 4,
      values: document.observed.visibleFacts,
      maxMatches: 2,
    },
    {
      key: "observed.setting",
      label: "setting",
      weight: 4,
      values: [document.observed.setting],
      maxMatches: 1,
    },
    {
      key: "interpretation.mood",
      label: "mood",
      weight: 4,
      values: document.interpretation.mood,
      maxMatches: 2,
    },
    {
      key: "observed.time",
      label: "time",
      weight: 3,
      values: [document.observed.time],
      maxMatches: 1,
    },
    {
      key: "observed.lighting",
      label: "lighting",
      weight: 3,
      values: document.observed.lighting,
      maxMatches: 2,
    },
    {
      key: "observed.colors",
      label: "color",
      weight: 3,
      values: document.observed.colors,
      maxMatches: 2,
    },
    {
      key: "observed.shotType",
      label: "shot type",
      weight: 3,
      values: [document.observed.shotType],
      maxMatches: 1,
    },
    {
      key: "observed.cameraMotion",
      label: "camera motion",
      weight: 3,
      values: [document.observed.cameraMotion],
      maxMatches: 1,
    },
    {
      key: "creative.editingUses",
      label: "editing use",
      weight: 2,
      values: document.creative.editingUses,
      maxMatches: 2,
    },
    {
      key: "interpretation.sceneInterpretation",
      label: "scene interpretation",
      weight: 2,
      values: [document.interpretation.sceneInterpretation],
      maxMatches: 1,
    },
    {
      key: "description",
      label: "description",
      weight: 1,
      values: [document.description],
      maxMatches: 1,
    },
  ];
}

function queryTokens(query: string) {
  return unique(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function expandedConcepts(token: string) {
  return unique([token, ...(synonyms[token] ?? [])]).map(normalizeText);
}

function scoreField(field: SearchField, tokens: string[]) {
  const normalizedValues = field.values
    .map(value => ({ raw: value, normalized: normalizeText(value) }))
    .filter(value => value.normalized);
  const matched: SearchMatchReason[] = [];
  const matchedTokens = new Set<string>();

  for (const token of tokens) {
    if (matchedTokens.has(token)) continue;
    const concepts = expandedConcepts(token);
    const match = normalizedValues.find(value =>
      concepts.some(concept => value.normalized.includes(concept))
    );
    if (!match) continue;
    matchedTokens.add(token);
    if (!matched.some(reason => reason.field === field.label && reason.value === match.raw)) {
      matched.push({ field: field.label, value: match.raw });
    }
  }

  const cappedMatches = Math.min(matchedTokens.size, field.maxMatches);
  return {
    score: cappedMatches * field.weight,
    reasons: matched.slice(0, field.maxMatches),
  };
}

export function rankFootage(clips: FootageClip[], query: string) {
  const tokens = queryTokens(query);
  if (!tokens.length)
    return clips.map(clip => ({ clip, score: 0, reasons: [] }));
  return clips
    .map(clip => {
      const fields = searchFields(buildSearchDocument(clip));
      const fieldScores = fields.map(field => scoreField(field, tokens));
      const score = fieldScores.reduce((sum, field) => sum + field.score, 0);
      const reasons = unique(
        fieldScores.flatMap(field =>
          field.reasons.map(reason => `${reason.field}: ${reason.value}`)
        )
      ).slice(0, 4);
      return { clip, score, reasons };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.clip.id) - Number(a.clip.id);
    });
}

export function rankSimilar(
  clips: FootageClip[],
  referenceId: number,
  dimension = "all"
) {
  const reference = clips.find(clip => clip.id === referenceId);
  if (!reference) return [];
  const comparisons: Record<string, (clip: FootageClip) => string[]> = {
    color: clip => clip.colors,
    mood: clip => clip.mood,
    lighting: clip => clip.lighting,
    subject: clip => clip.subjects,
    composition: clip => [clip.shotType],
    motion: clip => [clip.cameraMotion],
  };
  const enabled = dimension === "all" ? Object.keys(comparisons) : [dimension];
  const overlap = (a: string[], b: string[]) =>
    a.filter(value => b.includes(value)).length;
  return clips
    .filter(clip => clip.id !== reference.id)
    .map(clip => ({
      clip,
      score: enabled.reduce(
        (score, key) =>
          score +
          overlap(
            comparisons[key]?.(reference) ?? [],
            comparisons[key]?.(clip) ?? []
          ),
        0
      ),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function buildCollectionSuggestions(
  clips: FootageClip[]
): CollectionSuggestion[] {
  const groups = [
    {
      id: "night-stories",
      name: "Night stories",
      description: "Neon, low light and the moments after dark.",
      accent: "violet",
      matches: (clip: FootageClip) =>
        clip.time === "night" ||
        clip.lighting.some(value => value.includes("neon")),
    },
    {
      id: "quiet-in-between",
      name: "Quiet in-between",
      description: "Still, reflective material for breathing room.",
      accent: "amber",
      matches: (clip: FootageClip) =>
        clip.mood.some(value =>
          ["quiet", "calm", "reflective", "nostalgic", "lonely"].includes(value)
        ) || clip.cameraMotion === "static",
    },
    {
      id: "human-moments",
      name: "Human moments",
      description: "People, hands, laughter and memory-making details.",
      accent: "lime",
      matches: (clip: FootageClip) =>
        clip.subjects.some(value =>
          ["friends", "people", "hands", "cyclist"].includes(value)
        ),
    },
  ];
  return groups
    .map(group => {
      const matches = clips.filter(group.matches);
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        accent: group.accent,
        isAiSuggested: true as const,
        clipCount: matches.length,
        clipIds: matches.map(clip => clip.id),
      };
    })
    .filter(group => group.clipCount >= 2);
}

function safeArray(value: string, fallback: string[] = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
}

export function toFootageClip(clip: Clip): FootageClip {
  return {
    id: clip.id,
    projectId: clip.projectId,
    fileName: clip.fileName,
    durationMs: clip.durationMs,
    thumbnailUrl: clip.thumbnailUrl,
    mediaUrl: clip.mediaUrl,
    status: clip.status,
    description: clip.description,
    subjects: safeArray(clip.subjects),
    setting: clip.setting,
    time: clip.timeOfDay,
    lighting: safeArray(clip.lighting),
    colors: safeArray(clip.colors),
    mood: safeArray(clip.moods),
    shotType: clip.shotType,
    cameraMotion: clip.cameraMotion,
    possibleUses: safeArray(clip.possibleUses),
    createdAt: clip.createdAt,
    metadataJson: metadataJsonAsV2(clip.metadataJson),
  };
}
