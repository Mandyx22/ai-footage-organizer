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

export const ENVIRONMENT_TYPES = [
  "indoor",
  "outdoor",
  "semi-outdoor",
  "unknown",
] as const;
export const SOCIAL_CONTEXTS = [
  "alone",
  "pair",
  "small group",
  "crowd",
  "no people visible",
  "unknown",
] as const;
export const ACTIVITY_LEVELS = [
  "still",
  "low activity",
  "moderate activity",
  "active",
  "highly active",
  "unknown",
] as const;
export const VISUAL_DENSITIES = [
  "minimal",
  "sparse",
  "balanced",
  "busy",
  "cluttered",
  "unknown",
] as const;

export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];
export type SocialContext = (typeof SOCIAL_CONTEXTS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type VisualDensity = (typeof VISUAL_DENSITIES)[number];

export type ClipMetadataV2 = {
  description: string;
  observed: {
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
  projectIds: number[];
  fileName: string;
  durationMs: number;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  status: "uploading" | "analyzing" | "ready" | "failed";
  createdAt: Date | string;
  metadataJson?: ClipMetadataV2 | null;
};

export type ProjectSuggestion = {
  id: string;
  name: string;
  description: string;
  accent: string;
  isAiSuggested: true;
  clipCount: number;
  clipIds: number[];
};

const demoClip = (
  id: number,
  fileName: string,
  durationMs: number,
  metadata: ClipMetadataV2
): FootageClip => ({
  id,
  projectIds: [],
  fileName,
  durationMs,
  thumbnailUrl: null,
  mediaUrl: null,
  status: "ready",
  createdAt: new Date("2026-08-01T10:00:00Z"),
  ...metadataV2ToLegacy(metadata),
  metadataJson: metadata,
});

export const DEMO_CLIPS: FootageClip[] = [
  demoClip(101, "IMG_4821.MOV", 8200, {
    description:
      "Two people crossing a cobalt-blue side street under neon signs.",
    observed: {
      visibleFacts: ["two people", "shop signs", "side street"],
      subjects: ["people"],
      actions: ["crossing a street"],
      setting: "city street",
      weather: [],
      environmentType: "outdoor",
      socialContext: "pair",
      activityLevel: "moderate activity",
      visualDensity: "busy",
      spatialRelationships: ["two people under signs in a medium frame"],
      time: "night",
      lighting: ["neon", "low light"],
      colors: ["blue", "magenta"],
      shotType: "medium",
      cameraMotion: "likely tracking",
    },
    interpretation: {
      mood: ["dreamy", "energetic"],
      atmosphere: ["neon", "urban"],
      sceneInterpretation: "a night walk on a lit commercial street",
      uncertainty: ["camera motion inferred from still frames"],
    },
    creative: {
      editingUses: ["nightlife montage", "transition"],
    },
  }),
  demoClip(102, "DJI_0308.MP4", 14600, {
    description:
      "A quiet wide view of warm light falling through a station window.",
    observed: {
      visibleFacts: ["train window", "warm light", "empty seats"],
      subjects: ["train", "window"],
      actions: ["sitting still"],
      setting: "train interior",
      weather: [],
      environmentType: "indoor",
      socialContext: "no people visible",
      activityLevel: "still",
      visualDensity: "sparse",
      spatialRelationships: ["wide interior with light at the window"],
      time: "sunset",
      lighting: ["golden hour", "soft"],
      colors: ["amber", "cream"],
      shotType: "wide",
      cameraMotion: "likely static",
    },
    interpretation: {
      mood: ["reflective", "calm"],
      atmosphere: ["warm", "still"],
      sceneInterpretation: "a pause during travel at sunset",
      uncertainty: ["exact station location is not visible"],
    },
    creative: {
      editingUses: ["opening", "day-to-night transition"],
    },
  }),
  demoClip(103, "IMG_4887.MOV", 6100, {
    description:
      "Steam rises from ramen bowls as people laugh across a wooden table.",
    observed: {
      visibleFacts: ["ramen bowls", "steam", "wooden table", "people"],
      subjects: ["food", "people"],
      actions: ["eating at a table"],
      setting: "restaurant",
      weather: [],
      environmentType: "indoor",
      socialContext: "small group",
      activityLevel: "low activity",
      visualDensity: "balanced",
      spatialRelationships: ["bowls in the foreground with people across the table"],
      time: "night",
      lighting: ["warm practical", "low light"],
      colors: ["amber", "red"],
      shotType: "close-up",
      cameraMotion: "likely handheld",
    },
    interpretation: {
      mood: ["intimate", "lively"],
      atmosphere: ["warm", "close"],
      sceneInterpretation: "a shared meal in a small restaurant",
      uncertainty: ["number of people beyond the table edge is unclear"],
    },
    creative: {
      editingUses: ["food montage", "detail cutaway"],
    },
  }),
  demoClip(104, "IMG_4902.MOV", 12400, {
    description:
      "Rain traces luminous reflections across an almost empty city intersection.",
    observed: {
      visibleFacts: ["rain", "wet street", "reflections", "empty intersection"],
      subjects: ["street", "rain"],
      actions: ["rain falling"],
      setting: "city street",
      weather: ["rainy"],
      environmentType: "outdoor",
      socialContext: "no people visible",
      activityLevel: "still",
      visualDensity: "sparse",
      spatialRelationships: ["wide empty intersection with reflected lights"],
      time: "night",
      lighting: ["neon", "low light"],
      colors: ["blue", "violet"],
      shotType: "wide",
      cameraMotion: "likely static",
    },
    interpretation: {
      mood: ["quiet", "lonely"],
      atmosphere: ["wet", "hazy"],
      sceneInterpretation: "a paused city after rain",
      uncertainty: ["camera motion inferred from still frames"],
    },
    creative: {
      editingUses: ["reflective opening", "transition"],
    },
  }),
  demoClip(105, "GOPR_1172.MP4", 9400, {
    description:
      "A sunlit cyclist moves through a tree-lined path in the morning.",
    observed: {
      visibleFacts: ["cyclist", "trees", "path"],
      subjects: ["cyclist", "nature"],
      actions: ["riding a bicycle"],
      setting: "park",
      weather: ["sunny"],
      environmentType: "outdoor",
      socialContext: "alone",
      activityLevel: "active",
      visualDensity: "balanced",
      spatialRelationships: ["cyclist moving through a tree-lined path"],
      time: "morning",
      lighting: ["daylight", "dappled"],
      colors: ["green", "warm yellow"],
      shotType: "medium",
      cameraMotion: "likely moving",
    },
    interpretation: {
      mood: ["free", "optimistic"],
      atmosphere: ["airy", "bright"],
      sceneInterpretation: "a morning ride through a park",
      uncertainty: ["exact park location is not visible"],
    },
    creative: {
      editingUses: ["travel montage", "pace lift"],
    },
  }),
  demoClip(106, "IMG_4938.MOV", 5300, {
    description: "Hands turn the pages of a small book beside a window.",
    observed: {
      visibleFacts: ["hands", "book", "window"],
      subjects: ["hands", "book"],
      actions: ["turning pages"],
        setting: "room by a window",
      weather: [],
      environmentType: "indoor",
      socialContext: "alone",
      activityLevel: "low activity",
      visualDensity: "minimal",
      spatialRelationships: ["hands and book in close-up beside a window"],
      time: "afternoon",
      lighting: ["soft window light"],
      colors: ["cream", "brown"],
      shotType: "close-up",
      cameraMotion: "likely static",
    },
    interpretation: {
      mood: ["quiet", "nostalgic"],
      atmosphere: ["soft", "still"],
      sceneInterpretation: "a quiet indoor pause",
      uncertainty: ["the exact kind of room is not labeled in the frames"],
    },
    creative: {
      editingUses: ["breathing room", "detail cutaway"],
    },
  }),
  demoClip(107, "IMG_4951.MOV", 7600, {
    description: "People lean into the frame beneath a glowing shop sign.",
    observed: {
      visibleFacts: ["people", "shop sign", "close faces"],
      subjects: ["people"],
      actions: ["leaning into frame"],
      setting: "city street",
      weather: [],
      environmentType: "outdoor",
      socialContext: "small group",
      activityLevel: "low activity",
      visualDensity: "balanced",
      spatialRelationships: ["faces close to camera under a sign"],
      time: "night",
      lighting: ["neon", "mixed"],
      colors: ["blue", "pink"],
      shotType: "close-up",
      cameraMotion: "likely handheld",
    },
    interpretation: {
      mood: ["playful", "energetic"],
      atmosphere: ["neon", "intimate"],
      sceneInterpretation: "people posing under night signage",
      uncertainty: ["relationship among the people is not visible"],
    },
    creative: {
      editingUses: ["nightlife montage", "memory moment"],
    },
  }),
  demoClip(108, "DJI_0341.MP4", 18000, {
    description:
      "A high wide view of a coastal town disappearing into dusk.",
    observed: {
      visibleFacts: ["coast", "town", "open sky"],
      subjects: ["coast", "town"],
      actions: ["looking over a town"],
      setting: "coast",
      weather: [],
      environmentType: "outdoor",
      socialContext: "no people visible",
      activityLevel: "still",
      visualDensity: "balanced",
      spatialRelationships: ["town below a wide dusk sky"],
      time: "dusk",
      lighting: ["blue hour", "soft"],
      colors: ["blue", "slate"],
      shotType: "wide",
      cameraMotion: "likely moving",
    },
    interpretation: {
      mood: ["expansive"],
      atmosphere: ["open", "cool"],
      sceneInterpretation: "a coastal town at the end of the day",
      uncertainty: ["whether the camera is aerial is not confirmed from still frames"],
    },
    creative: {
      editingUses: ["establishing shot", "closing"],
    },
  }),
];

export const lexicalSynonyms: Record<string, string[]> = {
  quiet: ["calm", "reflective", "still", "intimate", "lonely", "quiet"],
  blue: ["blue", "cobalt", "violet", "neon", "cool", "slate"],
  night: ["night", "dusk", "neon", "low light"],
  people: ["people", "hands", "cyclist"],
  warm: ["amber", "golden", "warm", "cream", "yellow"],
  transition: ["transition", "cutaway", "breathing room"],
  dreamy: ["dreamy", "reflective", "nostalgic", "soft"],
};

export type SearchField = {
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
    weather: string[];
    environmentType: EnvironmentType;
    socialContext: SocialContext;
    activityLevel: ActivityLevel;
    visualDensity: VisualDensity;
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

function oneOf<const T extends readonly string[]>(
  value: unknown,
  values: T
): T[number] {
  return typeof value === "string" && values.includes(value)
    ? (value as T[number])
    : ("unknown" as T[number]);
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
      weather: isStringArray(metadata.observed.weather)
        ? metadata.observed.weather
        : [],
      environmentType: oneOf(
        metadata.observed.environmentType,
        ENVIRONMENT_TYPES
      ),
      socialContext: oneOf(metadata.observed.socialContext, SOCIAL_CONTEXTS),
      activityLevel: oneOf(metadata.observed.activityLevel, ACTIVITY_LEVELS),
      visualDensity: oneOf(metadata.observed.visualDensity, VISUAL_DENSITIES),
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
        weather: metadata.observed.weather,
        environmentType: metadata.observed.environmentType,
        socialContext: metadata.observed.socialContext,
        activityLevel: metadata.observed.activityLevel,
        visualDensity: metadata.observed.visualDensity,
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
      weather: [],
      environmentType: "unknown",
      socialContext: "unknown",
      activityLevel: "unknown",
      visualDensity: "unknown",
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

export function clipAskPayload(clip: FootageClip) {
  const durationSeconds = Math.round(clip.durationMs / 100) / 10;
  if (clip.metadataJson) {
    return {
      fileName: clip.fileName,
      durationSeconds,
      description: clip.metadataJson.description,
      observed: clip.metadataJson.observed,
      interpretation: clip.metadataJson.interpretation,
      creative: clip.metadataJson.creative,
    };
  }
  const document = buildSearchDocument(clip);
  return {
    fileName: clip.fileName,
    durationSeconds,
    description: document.description,
    observed: document.observed,
    interpretation: document.interpretation,
    creative: document.creative,
  };
}

export function searchFields(document: SearchDocument): SearchField[] {
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
  return unique([token, ...(lexicalSynonyms[token] ?? [])]).map(normalizeText);
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

export type SimilarityDimension =
  | "all"
  | "color"
  | "mood"
  | "lighting"
  | "subject"
  | "composition"
  | "motion";

const SIMILARITY_DIMENSIONS: Record<
  Exclude<SimilarityDimension, "all">,
  (document: SearchDocument) => string[]
> = {
  color: document => document.observed.colors,
  mood: document => document.interpretation.mood,
  lighting: document => document.observed.lighting,
  subject: document => [
    ...document.observed.subjects,
    ...document.observed.visibleFacts,
  ],
  composition: document => [document.observed.shotType],
  motion: document => [document.observed.cameraMotion],
};

export function rankSimilar(
  clips: FootageClip[],
  referenceId: number,
  dimension: SimilarityDimension = "all"
) {
  const reference = clips.find(clip => clip.id === referenceId);
  if (!reference) return [];
  const enabled =
    dimension === "all"
      ? (Object.keys(
          SIMILARITY_DIMENSIONS
        ) as Exclude<SimilarityDimension, "all">[])
      : ([dimension] as Exclude<SimilarityDimension, "all">[]);
  const referenceDocument = buildSearchDocument(reference);
  const overlap = (a: string[], b: string[]) =>
    a.filter(value => b.includes(value)).length;
  return clips
    .filter(clip => clip.id !== reference.id)
    .map(clip => {
      const document = buildSearchDocument(clip);
      return {
        clip,
        score: enabled.reduce(
          (score, key) =>
            score +
            overlap(
              SIMILARITY_DIMENSIONS[key](referenceDocument),
              SIMILARITY_DIMENSIONS[key](document)
            ),
          0
        ),
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function buildProjectSuggestions(
  clips: FootageClip[]
): ProjectSuggestion[] {
  const groups = [
    {
      id: "night-stories",
      name: "Night stories",
      description: "Neon, low light and the moments after dark.",
      accent: "violet",
      matches: (document: SearchDocument) =>
        document.observed.time === "night" ||
        document.observed.lighting.some(value => value.includes("neon")),
    },
    {
      id: "quiet-in-between",
      name: "Quiet in-between",
      description: "Still, reflective material for breathing room.",
      accent: "amber",
      matches: (document: SearchDocument) =>
        document.interpretation.mood.some(value =>
          ["quiet", "calm", "reflective", "nostalgic", "lonely"].includes(value)
        ) || /\bstatic\b/.test(document.observed.cameraMotion),
    },
    {
      id: "human-moments",
      name: "Human moments",
      description: "People, hands and the details of everyday life.",
      accent: "lime",
      matches: (document: SearchDocument) =>
        document.observed.subjects.some(value =>
          ["people", "hands", "cyclist"].includes(value)
        ),
    },
  ];
  return groups
    .map(group => {
      const matches = clips.filter(clip =>
        group.matches(buildSearchDocument(clip))
      );
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

export function toFootageClip(clip: Clip, projectIds: number[] = []): FootageClip {
  return {
    id: clip.id,
    projectIds,
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
