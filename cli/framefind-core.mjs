import { promises as fs } from "node:fs";
import path from "node:path";

export const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const STOP_WORDS = new Set(["img", "dji", "clip", "video", "mov", "mp4", "m4v", "final", "edit", "export", "copy", "the", "and", "of"]);
const COLOR_WORDS = ["blue", "red", "orange", "yellow", "green", "pink", "purple", "violet", "black", "white", "gold", "warm", "cool"];
const MOOD_WORDS = ["quiet", "calm", "dreamy", "lonely", "joyful", "playful", "nostalgic", "intimate", "reflective", "busy", "moody"];
const TIME_WORDS = ["night", "dusk", "dawn", "morning", "afternoon", "sunset", "sunrise", "day"];
const SHOT_WORDS = ["wide", "close", "macro", "medium", "detail", "portrait"];
const MOTION_WORDS = ["static", "pan", "tilt", "walk", "handheld", "drone", "tracking", "moving"];

export function tokenize(value = "") {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter(token => !STOP_WORDS.has(token)) ?? [];
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function inferMetadataFromPath(relativePath) {
  const parts = relativePath.split(path.sep).flatMap(tokenize);
  const colors = parts.filter(token => COLOR_WORDS.includes(token));
  const mood = parts.filter(token => MOOD_WORDS.includes(token));
  const time = parts.find(token => TIME_WORDS.includes(token)) ?? "unspecified";
  const shotType = parts.find(token => SHOT_WORDS.includes(token)) ?? "unspecified";
  const cameraMotion = parts.find(token => MOTION_WORDS.includes(token)) ?? "unspecified";
  const setting = parts.length > 1 ? parts[0] : "unclassified";
  const subjects = parts.filter(token => ![...COLOR_WORDS, ...MOOD_WORDS, ...TIME_WORDS, ...SHOT_WORDS, ...MOTION_WORDS].includes(token)).slice(0, 5);
  return {
    description: `Local video indexed from ${relativePath}. Add AI notes to make this description richer.`,
    subjects: unique(subjects),
    setting,
    time,
    lighting: time === "night" || time === "dusk" ? ["low light"] : [],
    colors: unique(colors),
    mood: unique(mood),
    shotType,
    cameraMotion,
    possibleUses: unique([...mood, ...colors, time].filter(value => value !== "unspecified")),
    source: "path-inference",
  };
}

export async function scanFolder(rootFolder) {
  const root = path.resolve(rootFolder);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Folder not found: ${root}`);
  const entries = [];
  async function visit(current) {
    const children = await fs.readdir(current, { withFileTypes: true });
    for (const child of children) {
      if (child.name.startsWith(".")) continue;
      const fullPath = path.join(current, child.name);
      if (child.isDirectory()) await visit(fullPath);
      if (child.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(child.name).toLowerCase())) entries.push(fullPath);
    }
  }
  await visit(root);
  return entries.sort((a, b) => a.localeCompare(b));
}

export async function createIndex(rootFolder) {
  const root = path.resolve(rootFolder);
  const files = await scanFolder(root);
  const clips = await Promise.all(files.map(async filePath => {
    const stats = await fs.stat(filePath);
    const relativePath = path.relative(root, filePath);
    return {
      id: relativePath.replaceAll(path.sep, "/"),
      path: filePath,
      relativePath,
      fileName: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase(),
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      durationSeconds: null,
      metadata: inferMetadataFromPath(relativePath),
    };
  }));
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), root, clips };
}

export async function writeIndex(indexPath, index) {
  const resolved = path.resolve(indexPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return resolved;
}

export async function readIndex(indexPath) {
  const resolved = path.resolve(indexPath);
  const raw = await fs.readFile(resolved, "utf8").catch(() => null);
  if (!raw) throw new Error(`Index not found: ${resolved}. Run “framefind index <folder>” first.`);
  const index = JSON.parse(raw);
  if (index?.schemaVersion !== 1 || !Array.isArray(index.clips)) throw new Error(`Index format is not supported: ${resolved}`);
  return index;
}

function metadataValues(clip) {
  const metadata = clip.metadata ?? {};
  return [clip.fileName, clip.relativePath, metadata.description, metadata.setting, metadata.time, metadata.shotType, metadata.cameraMotion, ...(metadata.subjects ?? []), ...(metadata.lighting ?? []), ...(metadata.colors ?? []), ...(metadata.mood ?? []), ...(metadata.possibleUses ?? [])].map(value => String(value ?? "").toLowerCase());
}

export function rankClips(clips, query) {
  const terms = tokenize(query);
  if (!terms.length) return clips.map(clip => ({ clip, score: 0, matches: [] }));
  return clips.map(clip => {
    const values = metadataValues(clip);
    const matches = terms.filter(term => values.some(value => value.includes(term)));
    const exactDescription = String(clip.metadata?.description ?? "").toLowerCase().includes(String(query).toLowerCase());
    return { clip, score: matches.length * 4 + (exactDescription ? 2 : 0), matches };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.clip.fileName.localeCompare(b.clip.fileName));
}

function overlapScore(a, b) {
  const source = new Set((a ?? []).map(value => String(value).toLowerCase()));
  return (b ?? []).reduce((score, value) => score + (source.has(String(value).toLowerCase()) ? 1 : 0), 0);
}

export function rankSimilar(clips, referenceId, dimension = "all") {
  const reference = clips.find(clip => clip.id === referenceId || clip.relativePath === referenceId || clip.fileName === referenceId);
  if (!reference) throw new Error(`Clip not found in index: ${referenceId}`);
  const fields = dimension === "all" ? ["colors", "lighting", "mood", "subjects", "setting", "time", "shotType", "cameraMotion"] : dimension === "composition" ? ["shotType", "subjects"] : dimension === "motion" ? ["cameraMotion"] : dimension === "subject" ? ["subjects"] : dimension === "color" ? ["colors"] : [dimension];
  return clips.filter(clip => clip.id !== reference.id).map(clip => {
    let score = 0;
    for (const field of fields) {
      const a = reference.metadata?.[field];
      const b = clip.metadata?.[field];
      score += Array.isArray(a) ? overlapScore(a, b) : String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase() && a ? 1 : 0;
    }
    return { clip, score };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.clip.fileName.localeCompare(b.clip.fileName));
}

export function buildLocalPlan(clips, brief) {
  if (!clips.length) throw new Error("Select one or more indexed clips for a plan.");
  const uniqueField = field => unique(clips.flatMap(clip => Array.isArray(clip.metadata?.[field]) ? clip.metadata[field] : [clip.metadata?.[field]]).filter(Boolean));
  const moods = uniqueField("mood").slice(0, 3);
  const colors = uniqueField("colors").slice(0, 3);
  const shots = uniqueField("shotType");
  const motion = uniqueField("cameraMotion");
  const opening = clips.find(clip => ["wide", "establishing"].includes(String(clip.metadata?.shotType).toLowerCase())) ?? clips[0];
  const detail = clips.find(clip => ["close", "macro", "detail"].includes(String(clip.metadata?.shotType).toLowerCase())) ?? clips[clips.length - 1];
  const gaps = [];
  if (!shots.some(shot => ["wide", "establishing"].includes(String(shot).toLowerCase()))) gaps.push("an establishing or wide shot");
  if (!shots.some(shot => ["close", "macro", "detail"].includes(String(shot).toLowerCase()))) gaps.push("a close detail shot");
  if (!motion.some(value => String(value).toLowerCase() !== "static" && String(value).toLowerCase() !== "unspecified")) gaps.push("a short movement or transition shot");
  return {
    brief,
    direction: `${moods.length ? moods.join(", ") : "observational"} material with ${colors.length ? colors.join(" and ") : "a mixed"} palette.`,
    sequence: [`Open on ${opening.fileName} to establish the space or feeling.`, `Move through ${clips.slice(1, -1).map(clip => clip.fileName).join(", ") || "the selected material"} using cuts that follow light, color, or gesture.`, `Hold on ${detail.fileName} as a final detail or breath.`],
    caveat: gaps.length ? `You may still need ${gaps.join(" and ")}.` : "The selection already contains a useful spread of shot scale and motion.",
  };
}

export function findClip(index, identifier) {
  const clip = index.clips.find(candidate => candidate.id === identifier || candidate.relativePath === identifier || candidate.fileName === identifier);
  if (!clip) throw new Error(`Clip not found in index: ${identifier}`);
  return clip;
}
