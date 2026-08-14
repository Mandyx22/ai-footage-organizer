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

export type FootageClip = ClipMetadata & {
  id: number;
  fileName: string;
  durationMs: number;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  status: "uploading" | "analyzing" | "ready" | "failed";
  createdAt: Date | string;
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

const p = (id: number, fileName: string, durationMs: number, metadata: ClipMetadata): FootageClip => ({
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
  p(101, "IMG_4821.MOV", 8200, { description: "Two friends crossing a cobalt-blue side street under neon signs.", subjects: ["friends", "people"], setting: "city street", time: "night", lighting: ["neon", "low light"], colors: ["blue", "magenta"], mood: ["dreamy", "energetic"], shotType: "medium", cameraMotion: "handheld tracking", possibleUses: ["nightlife montage", "transition"] }),
  p(102, "DJI_0308.MP4", 14600, { description: "A quiet wide view of warm light falling through a station window.", subjects: ["train", "window"], setting: "train interior", time: "sunset", lighting: ["golden hour", "soft"], colors: ["amber", "cream"], mood: ["reflective", "calm"], shotType: "wide", cameraMotion: "static", possibleUses: ["opening", "day-to-night transition"] }),
  p(103, "IMG_4887.MOV", 6100, { description: "Steam rises from ramen bowls as friends laugh across a wooden table.", subjects: ["food", "friends"], setting: "restaurant", time: "night", lighting: ["warm practical", "low light"], colors: ["amber", "red"], mood: ["intimate", "lively"], shotType: "close-up", cameraMotion: "gentle handheld", possibleUses: ["food montage", "detail cutaway"] }),
  p(104, "IMG_4902.MOV", 12400, { description: "Rain traces luminous reflections across an almost empty city intersection.", subjects: ["street", "rain"], setting: "city street", time: "night", lighting: ["neon", "low light"], colors: ["blue", "violet"], mood: ["quiet", "lonely"], shotType: "wide", cameraMotion: "static", possibleUses: ["reflective opening", "transition"] }),
  p(105, "GOPR_1172.MP4", 9400, { description: "A sunlit cyclist moves through a tree-lined path in the morning.", subjects: ["cyclist", "nature"], setting: "park", time: "morning", lighting: ["daylight", "dappled"], colors: ["green", "warm yellow"], mood: ["free", "optimistic"], shotType: "medium", cameraMotion: "forward motion", possibleUses: ["travel montage", "pace lift"] }),
  p(106, "IMG_4938.MOV", 5300, { description: "Hands turn the pages of a small book beside a hotel window.", subjects: ["hands", "book"], setting: "hotel room", time: "afternoon", lighting: ["soft window light"], colors: ["cream", "brown"], mood: ["quiet", "nostalgic"], shotType: "close-up", cameraMotion: "static", possibleUses: ["breathing room", "detail cutaway"] }),
  p(107, "IMG_4951.MOV", 7600, { description: "Friends lean into the frame beneath a glowing shop sign.", subjects: ["friends", "people"], setting: "city street", time: "night", lighting: ["neon", "mixed"], colors: ["blue", "pink"], mood: ["playful", "energetic"], shotType: "close-up", cameraMotion: "handheld", possibleUses: ["nightlife montage", "memory moment"] }),
  p(108, "DJI_0341.MP4", 18000, { description: "A slow aerial reveal of a coastal town disappearing into dusk.", subjects: ["coast", "town"], setting: "coast", time: "dusk", lighting: ["blue hour", "soft"], colors: ["blue", "slate"], mood: ["expansive", "calm"], shotType: "wide", cameraMotion: "aerial reveal", possibleUses: ["establishing shot", "closing"] }),
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

function haystack(clip: FootageClip) {
  return [clip.description, ...clip.subjects, clip.setting, clip.time, ...clip.lighting, ...clip.colors, ...clip.mood, clip.shotType, clip.cameraMotion, ...clip.possibleUses]
    .join(" ")
    .toLowerCase();
}

export function rankFootage(clips: FootageClip[], query: string) {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!tokens.length) return clips.map(clip => ({ clip, score: 0 }));
  return clips
    .map(clip => {
      const text = haystack(clip);
      const score = tokens.reduce((sum, token) => {
        const concepts = [token, ...(synonyms[token] ?? [])];
        return sum + (concepts.some(concept => text.includes(concept)) ? 1 : 0);
      }, 0);
      return { clip, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function rankSimilar(clips: FootageClip[], referenceId: number, dimension = "all") {
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
  const overlap = (a: string[], b: string[]) => a.filter(value => b.includes(value)).length;
  return clips
    .filter(clip => clip.id !== reference.id)
    .map(clip => ({
      clip,
      score: enabled.reduce((score, key) => score + overlap(comparisons[key]?.(reference) ?? [], comparisons[key]?.(clip) ?? []), 0),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function buildCollectionSuggestions(clips: FootageClip[]): CollectionSuggestion[] {
  const groups = [
    {
      id: "night-stories",
      name: "Night stories",
      description: "Neon, low light and the moments after dark.",
      accent: "violet",
      matches: (clip: FootageClip) => clip.time === "night" || clip.lighting.some(value => value.includes("neon")),
    },
    {
      id: "quiet-in-between",
      name: "Quiet in-between",
      description: "Still, reflective material for breathing room.",
      accent: "amber",
      matches: (clip: FootageClip) => clip.mood.some(value => ["quiet", "calm", "reflective", "nostalgic", "lonely"].includes(value)) || clip.cameraMotion === "static",
    },
    {
      id: "human-moments",
      name: "Human moments",
      description: "People, hands, laughter and memory-making details.",
      accent: "lime",
      matches: (clip: FootageClip) => clip.subjects.some(value => ["friends", "people", "hands", "cyclist"].includes(value)),
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
  };
}
