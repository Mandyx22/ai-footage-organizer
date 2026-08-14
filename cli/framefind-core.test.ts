import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCopyPlan, buildLocalPlan, createIndex, executeCopyPlan, rankClips, rankSimilar, scanFolder } from "./framefind-core.mjs";

const temporaryFolders: string[] = [];

afterEach(async () => { await Promise.all(temporaryFolders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });

describe("Framefind CLI core", () => {
  it("recursively indexes supported video files and infers local metadata from paths", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "framefind-cli-"));
    temporaryFolders.push(folder);
    await writeFile(path.join(folder, "quiet-blue-night.mp4"), "fixture");
    await writeFile(path.join(folder, "notes.txt"), "ignore");
    const index = await createIndex(folder);
    expect(index.clips).toHaveLength(1);
    expect(index.clips[0]?.metadata.colors).toContain("blue");
    expect(index.clips[0]?.metadata.mood).toContain("quiet");
    expect(index.clips[0]?.metadata.time).toBe("night");
  });

  it("searches, ranks similar footage, and generates a local creative plan without AI", () => {
    const clips = [
      { id: "night-wide.mp4", fileName: "night-wide.mp4", relativePath: "night-wide.mp4", metadata: { description: "quiet blue city night", colors: ["blue"], mood: ["quiet"], lighting: ["neon"], subjects: ["street"], setting: "city", time: "night", shotType: "wide", cameraMotion: "static", possibleUses: ["opening"] } },
      { id: "night-detail.mp4", fileName: "night-detail.mp4", relativePath: "night-detail.mp4", metadata: { description: "quiet blue rain detail", colors: ["blue"], mood: ["quiet"], lighting: ["neon"], subjects: ["rain"], setting: "city", time: "night", shotType: "close", cameraMotion: "handheld", possibleUses: ["transition"] } },
      { id: "sunset.mp4", fileName: "sunset.mp4", relativePath: "sunset.mp4", metadata: { description: "warm sunset", colors: ["orange"], mood: ["joyful"], lighting: ["golden"], subjects: ["people"], setting: "park", time: "sunset", shotType: "wide", cameraMotion: "moving", possibleUses: ["ending"] } },
    ];
    expect(rankClips(clips, "quiet blue night").map(result => result.clip.id)).toEqual(["night-detail.mp4", "night-wide.mp4"]);
    expect(rankSimilar(clips, "night-wide.mp4", "color").map(result => result.clip.id)).toContain("night-detail.mp4");
    const plan = buildLocalPlan(clips.slice(0, 2), "a reflective city opening");
    expect(plan.sequence[0]).toContain("night-wide.mp4");
    expect(plan.caveat).toContain("useful spread");
  });

  it("reports clear errors for unavailable folders and clips", async () => {
    await expect(scanFolder(path.join(os.tmpdir(), "framefind-folder-that-does-not-exist"))).rejects.toThrow("Folder not found");
    expect(() => rankSimilar([], "missing.mov", "all")).toThrow("Clip not found in index");
  });

  it("previews and copies selected clips into a new folder without changing originals", async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), "framefind-source-"));
    const destination = await mkdtemp(path.join(os.tmpdir(), "framefind-destination-"));
    temporaryFolders.push(source, destination);
    const nested = path.join(source, "night", "quiet-blue.mov");
    await writeFile(nested, "fixture").catch(async () => { await (await import("node:fs/promises")).mkdir(path.dirname(nested), { recursive: true }); await writeFile(nested, "fixture"); });
    const index = await createIndex(source);
    const plan = buildCopyPlan(index, [index.clips[0].id], destination);
    await executeCopyPlan(plan);
    expect(plan.items[0].target).toBe(path.join(destination, "night", "quiet-blue.mov"));
    expect(await readFile(nested, "utf8")).toBe("fixture");
    expect(await readFile(plan.items[0].target, "utf8")).toBe("fixture");
  });
});
