import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn(),
  addClipToCollection: vi.fn(),
  createEditingProject: vi.fn(),
  deleteClipForUser: vi.fn(),
  listClipsForUser: vi.fn(),
  listEditingProjectsForUser: vi.fn(),
  listLLMModels: vi.fn(),
  moveClipToEditingProject: vi.fn(),
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => ({
  createCollection: mocks.createCollection,
  addClipToCollection: mocks.addClipToCollection,
  createEditingProject: mocks.createEditingProject,
  deleteClipForUser: mocks.deleteClipForUser,
  listClipsForUser: mocks.listClipsForUser,
  listEditingProjectsForUser: mocks.listEditingProjectsForUser,
  listCollectionsForUser: vi.fn(async () => []),
  moveClipToEditingProject: mocks.moveClipToEditingProject,
  createAnalyzedClip: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  listLLMModels: mocks.listLLMModels,
  invokeLLM: mocks.invokeLLM,
}));

import { appRouter } from "./routers";

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 9,
      openId: "test-creator",
      name: "Test Creator",
      email: "creator@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("protected footage procedures", () => {
  it("keeps My Library personal by returning no sample fallback when the user has no clips", async () => {
    mocks.listClipsForUser.mockResolvedValue([]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.personalList();

    expect(result).toEqual({ clips: [], mode: "personal" });
    expect(mocks.listClipsForUser).toHaveBeenCalledWith(9, undefined);
  });

  it("returns the authenticated creator's uploaded clips through My Library", async () => {
    mocks.listClipsForUser.mockResolvedValue([{ id: 333, userId: 9, fileName: "my-upload.mov", mimeType: "video/quicktime", sizeBytes: 128, durationMs: 1_200, status: "ready", storageKey: "clips/333.mov", mediaUrl: "/manus-storage/clips/333.mov", thumbnailUrl: null, description: "A quiet personal clip.", subjects: "[\"friend\"]", setting: "train", timeOfDay: "night", lighting: "[\"low light\"]", colors: "[\"blue\"]", moods: "[\"quiet\"]", shotType: "close", cameraMotion: "handheld", possibleUses: "[\"opening\"]", createdAt: new Date(), updatedAt: new Date() }]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.personalList();

    expect(result.mode).toBe("personal");
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]).toMatchObject({ id: 333, fileName: "my-upload.mov", mood: ["quiet"] });

    const sample = await caller.footage.sampleList();
    expect(sample.mode).toBe("sample");
    expect(sample.clips).toHaveLength(8);
    expect(sample.clips.some(clip => clip.fileName === "my-upload.mov")).toBe(false);
  });

  it("creates a collection and persists selected clip membership for its owner", async () => {
    mocks.createCollection.mockResolvedValue({ id: 77, userId: 9, name: "Night out", description: null, accent: "violet", isAiSuggested: false });
    mocks.addClipToCollection.mockResolvedValue(true);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const collection = await caller.collections.create({ name: "Night out", description: "Neon material" });
    const membership = await caller.collections.addClip({ collectionId: 77, clipId: 101 });

    expect(collection).toMatchObject({ id: 77, name: "Night out" });
    expect(mocks.createCollection).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, name: "Night out" }));
    expect(membership).toEqual({ success: true });
    expect(mocks.addClipToCollection).toHaveBeenCalledWith({ userId: 9, collectionId: 77, clipId: 101 });
  });

  it("creates editing projects and scopes their clip counts to the authenticated workspace", async () => {
    mocks.createEditingProject.mockResolvedValue({ id: 12, userId: 9, name: "Taipei diary", description: null, accent: "peach" });
    mocks.listEditingProjectsForUser.mockResolvedValue([{ id: 12, userId: 9, name: "Taipei diary", description: null, accent: "peach", createdAt: new Date(), updatedAt: new Date() }]);
    mocks.listClipsForUser.mockResolvedValue([{ id: 333, userId: 9, projectId: 12, fileName: "my-upload.mov" }]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const project = await caller.projects.create({ name: "Taipei diary" });
    const list = await caller.projects.list();

    expect(project).toMatchObject({ id: 12, name: "Taipei diary" });
    expect(mocks.createEditingProject).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, name: "Taipei diary" }));
    expect(list.projects[0]).toMatchObject({ id: 12, clipCount: 1 });
    expect(list.unassignedCount).toBe(0);
  });

  it("moves and deletes only clips available in the authenticated workspace", async () => {
    mocks.moveClipToEditingProject.mockResolvedValue(true);
    mocks.deleteClipForUser.mockResolvedValue(true);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(caller.footage.moveToProject({ clipId: 333, projectId: 12 })).resolves.toEqual({ success: true });
    await expect(caller.footage.delete({ clipId: 333 })).resolves.toEqual({ success: true });
    expect(mocks.moveClipToEditingProject).toHaveBeenCalledWith({ userId: 9, clipId: 333, projectId: 12 });
    expect(mocks.deleteClipForUser).toHaveBeenCalledWith({ userId: 9, clipId: 333 });
  });

  it("returns a grounded creative answer when selected footage metadata is available", async () => {
    mocks.listClipsForUser.mockResolvedValue([]);
    mocks.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] });
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Start on the blue night street, then cut to the ramen detail for contrast." } }] });
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.ask({ question: "What could make a strong opening?", clipIds: [101, 103] });

    expect(result.answer).toContain("blue night street");
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5-mini" }));
    const messages = mocks.invokeLLM.mock.calls[0]?.[0]?.messages;
    expect(JSON.stringify(messages)).toContain("IMG_4821.MOV");
    expect(JSON.stringify(messages)).toContain("IMG_4887.MOV");
  });
});
