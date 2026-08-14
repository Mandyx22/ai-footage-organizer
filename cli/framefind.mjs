#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildLocalPlan, createIndex, findClip, rankClips, rankSimilar, readIndex, writeIndex } from "./framefind-core.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_INDEX = "framefind.index.json";

function usage() {
  console.log(`
Framefind CLI — local footage retrieval in your terminal

Usage:
  pnpm framefind index <folder> [--index <file>]
  pnpm framefind list [--index <file>]
  pnpm framefind search <query> [--index <file>] [--limit 8]
  pnpm framefind similar <clip-id-or-file> [--index <file>] [--by color|mood|lighting|subject|composition|motion|all]
  pnpm framefind plan <brief> --select <clip-id,file,...> [--index <file>]
  pnpm framefind analyze <clip-id-or-file> --confirm-ai [--index <file>]
  pnpm framefind plan <brief> --select <clip-id,file,...> --ai --confirm-ai [--index <file>]

Notes:
  • “index” reads video names, paths, sizes, and modified times locally. It never uploads a file.
  • “analyze --confirm-ai” sends one extracted representative frame to the configured LLM provider.
  • The index is an ordinary JSON file you own; use --index to keep it wherever you prefer.
`);
}

function parseArgs(args) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) { positionals.push(value); continue; }
    const [key, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) { flags[key] = inlineValue; continue; }
    if (args[index + 1] && !args[index + 1].startsWith("--")) { flags[key] = args[index + 1]; index += 1; } else flags[key] = true;
  }
  return { positionals, flags };
}

function indexPath(flags) { return path.resolve(String(flags.index ?? DEFAULT_INDEX)); }
function printClip(clip, suffix = "") { console.log(`• ${clip.id}${suffix}\n  ${clip.fileName}\n  ${clip.metadata?.description ?? "No local notes yet."}`); }
function assertConfirm(flags) { if (flags["confirm-ai"] !== true) throw new Error("This optional command sends one representative frame or metadata to your configured LLM provider. Re-run with --confirm-ai to proceed."); }

async function probeDuration(filePath) {
  try { const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { timeout: 12_000 }); const duration = Number(stdout.trim()); return Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null; } catch { return null; }
}

async function extractRepresentativeFrame(filePath) {
  const framePath = path.join(os.tmpdir(), `framefind-${process.pid}-${Date.now()}.jpg`);
  try {
    await execFileAsync("ffmpeg", ["-y", "-ss", "00:00:01", "-i", filePath, "-frames:v", "1", "-vf", "scale='min(960,iw)':-2", framePath], { timeout: 45_000 });
    const base64 = await readFile(framePath, "base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch { throw new Error("Representative-frame analysis requires ffmpeg and a readable video file. Install ffmpeg, then try again."); } finally { await unlink(framePath).catch(() => {}); }
}

async function requestModel() {
  const base = process.env.FRAMEFIND_API_BASE ?? process.env.BUILT_IN_FORGE_API_URL;
  const key = process.env.FRAMEFIND_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY;
  if (!base || !key) throw new Error("No AI credentials found. Set FRAMEFIND_API_BASE and FRAMEFIND_API_KEY, or run inside the configured project environment.");
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/models`, { headers: { authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error("Could not list configured AI models.");
  const models = (await response.json()).data ?? [];
  const model = models.find(candidate => candidate.id === "gemini-3-flash-preview")?.id ?? models.find(candidate => candidate.id === "gpt-5-mini")?.id;
  if (!model) throw new Error("No supported Framefind AI model was available.");
  return { base, key, model };
}

async function analyzeClip(index, identifier) {
  const clip = findClip(index, identifier);
  const { base, key, model } = await requestModel();
  const frame = await extractRepresentativeFrame(clip.path);
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Analyze a single representative video frame. Infer only what is visually supported. Return concise lower-case English tags in the requested JSON schema. Mood is a creative impression, not a fact." },
        { role: "user", content: [{ type: "text", text: `Analyze ${clip.fileName}.` }, { type: "image_url", image_url: { url: frame, detail: "low" } }] },
      ],
      response_format: { type: "json_schema", json_schema: { name: "framefind_metadata", strict: true, schema: { type: "object", properties: { description: { type: "string" }, subjects: { type: "array", items: { type: "string" } }, setting: { type: "string" }, time: { type: "string" }, lighting: { type: "array", items: { type: "string" } }, colors: { type: "array", items: { type: "string" } }, mood: { type: "array", items: { type: "string" } }, shotType: { type: "string" }, cameraMotion: { type: "string" }, possibleUses: { type: "array", items: { type: "string" } } }, required: ["description", "subjects", "setting", "time", "lighting", "colors", "mood", "shotType", "cameraMotion", "possibleUses"], additionalProperties: false } } },
    }),
  });
  if (!response.ok) throw new Error(`AI analysis failed: ${response.status} ${response.statusText}`);
  const raw = (await response.json()).choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("AI analysis returned no structured metadata.");
  clip.metadata = { ...JSON.parse(raw), source: "ai-representative-frame" };
  clip.durationSeconds = await probeDuration(clip.path);
  return clip;
}

async function aiPlan(clips, brief) {
  const { base, key, model } = await requestModel();
  const metadata = clips.map(clip => ({ fileName: clip.fileName, durationSeconds: clip.durationSeconds, metadata: clip.metadata }));
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: [{ role: "system", content: "You are Framefind, a concise creative retrieval assistant. Use only supplied clip metadata. Give direction, a three-beat sequence, and one coverage caveat. Do not claim to watch unprovided video." }, { role: "user", content: `Brief: ${brief}\n\nSelected clip metadata:\n${JSON.stringify(metadata)}` }] }) });
  if (!response.ok) throw new Error(`AI plan failed: ${response.status} ${response.statusText}`);
  const answer = (await response.json()).choices?.[0]?.message?.content;
  if (typeof answer !== "string") throw new Error("AI plan returned no text.");
  return answer;
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals.shift();
  if (!command || ["help", "--help", "-h"].includes(command)) return usage();
  if (command === "index") {
    const folder = positionals[0]; if (!folder) throw new Error("Choose a folder: framefind index <folder>");
    const index = await createIndex(folder); const output = await writeIndex(indexPath(flags), index);
    console.log(`Indexed ${index.clips.length} video files locally.\nIndex: ${output}\n\nNext: framefind search "quiet blue night shots" --index ${output}`); return;
  }
  const index = await readIndex(indexPath(flags));
  if (command === "list") { console.log(`Framefind local index · ${index.clips.length} clips · ${index.root}`); index.clips.forEach(clip => printClip(clip)); return; }
  if (command === "search") { const query = positionals.join(" "); if (!query) throw new Error("Add a query: framefind search \"quiet blue night shots\""); const limit = Math.max(1, Number(flags.limit ?? 8)); const results = rankClips(index.clips, query).slice(0, limit); console.log(`\nSearch: “${query}” · ${results.length} matches\n`); results.forEach(result => printClip(result.clip, `  [${result.score}] matches: ${result.matches.join(", ")}`)); return; }
  if (command === "similar") { const identifier = positionals[0]; if (!identifier) throw new Error("Choose a clip: framefind similar <clip-id-or-file>"); const dimension = String(flags.by ?? "all"); const results = rankSimilar(index.clips, identifier, dimension).slice(0, Number(flags.limit ?? 8)); console.log(`\nSimilar to ${identifier} by ${dimension}\n`); results.forEach(result => printClip(result.clip, `  [${result.score}]`)); return; }
  if (command === "plan") { const brief = positionals.join(" "); const selected = String(flags.select ?? "").split(",").map(value => value.trim()).filter(Boolean).map(identifier => findClip(index, identifier)); if (!brief || !selected.length) throw new Error("Use: framefind plan \"your brief\" --select clip-one.mov,clip-two.mov"); if (flags.ai === true) { assertConfirm(flags); console.log(await aiPlan(selected, brief)); } else { const plan = buildLocalPlan(selected, brief); console.log(`\nDirection\n${plan.direction}\n\nSequence\n${plan.sequence.map((step, number) => `${number + 1}. ${step}`).join("\n")}\n\nCoverage note\n${plan.caveat}`); } return; }
  if (command === "analyze") { const identifier = positionals[0]; if (!identifier) throw new Error("Choose a clip: framefind analyze <clip-id-or-file> --confirm-ai"); assertConfirm(flags); const clip = await analyzeClip(index, identifier); index.generatedAt = new Date().toISOString(); await writeIndex(indexPath(flags), index); console.log(`AI notes saved for ${clip.fileName}.\nDescription: ${clip.metadata.description}`); return; }
  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => { console.error(`\nFramefind: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
