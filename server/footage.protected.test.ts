import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  addClipToProject: vi.fn(),
  createAnalyzedClip: vi.fn(),
  createEditingProject: vi.fn(),
  deleteClipForUser: vi.fn(),
  renameClipForUser: vi.fn(),
  listClipsForUser: vi.fn(),
  listEditingProjectsForUser: vi.fn(),
  listProjectClipMemberships: vi.fn(),
  removeClipFromProject: vi.fn(),
  analyzeFrames: vi.fn(),
  listLLMModels: vi.fn(),
  invokeLLM: vi.fn(),
  storagePut: vi.fn(),
  userOwnsEditingProject: vi.fn(),
}));

vi.mock("./db", () => ({
  addClipToProject: mocks.addClipToProject,
  createEditingProject: mocks.createEditingProject,
  deleteClipForUser: mocks.deleteClipForUser,
  renameClipForUser: mocks.renameClipForUser,
  listClipsForUser: mocks.listClipsForUser,
  listEditingProjectsForUser: mocks.listEditingProjectsForUser,
  listProjectClipMemberships: mocks.listProjectClipMemberships,
  removeClipFromProject: mocks.removeClipFromProject,
  createAnalyzedClip: mocks.createAnalyzedClip,
  userOwnsEditingProject: mocks.userOwnsEditingProject,
}));

vi.mock("./_core/llm", () => ({
  listLLMModels: mocks.listLLMModels,
  invokeLLM: mocks.invokeLLM,
}));

vi.mock("./_core/frameAnalysisProvider", () => ({
  getFrameAnalysisProvider: () => ({
    analyzeFrames: mocks.analyzeFrames,
  }),
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storagePut,
}));

import { appRouter } from "./routers";

function metadataV2(
  overrides: Partial<{
    description: string;
    subjects: string[];
    actions: string[];
    setting: string;
    weather: string[];
    environmentType: "indoor" | "outdoor" | "semi-outdoor" | "unknown";
    socialContext:
      | "alone"
      | "pair"
      | "small group"
      | "crowd"
      | "no people visible"
      | "unknown";
    activityLevel:
      | "still"
      | "low activity"
      | "moderate activity"
      | "active"
      | "highly active"
      | "unknown";
    visualDensity:
      | "minimal"
      | "sparse"
      | "balanced"
      | "busy"
      | "cluttered"
      | "unknown";
    spatialRelationships: string[];
    time: string;
    lighting: string[];
    colors: string[];
    mood: string[];
    atmosphere: string[];
    shotType: string;
    cameraMotion: string;
    editingUses: string[];
    visibleFacts: string[];
    sceneInterpretation: string;
    uncertainty: string[];
  }> = {}
) {
  return {
    description:
      overrides.description ?? "a person walks through a neon street at night",
    observed: {
      visibleFacts: overrides.visibleFacts ?? [
        "person walking",
        "neon street",
        "night",
      ],
      subjects: overrides.subjects ?? ["person", "street"],
      actions: overrides.actions ?? ["walking through street"],
      setting: overrides.setting ?? "city street",
      weather: overrides.weather ?? [],
      environmentType: overrides.environmentType ?? "outdoor",
      socialContext: overrides.socialContext ?? "alone",
      activityLevel: overrides.activityLevel ?? "moderate activity",
      visualDensity: overrides.visualDensity ?? "balanced",
      spatialRelationships: overrides.spatialRelationships ?? [
        "person in foreground with street behind",
      ],
      time: overrides.time ?? "night",
      lighting: overrides.lighting ?? ["neon"],
      colors: overrides.colors ?? ["blue", "magenta"],
      shotType: overrides.shotType ?? "medium",
      cameraMotion: overrides.cameraMotion ?? "unknown",
    },
    interpretation: {
      mood: overrides.mood ?? ["lively"],
      atmosphere: overrides.atmosphere ?? ["neon", "urban"],
      sceneInterpretation:
        overrides.sceneInterpretation ?? "urban night movement",
      uncertainty: overrides.uncertainty ?? [],
    },
    creative: {
      editingUses: overrides.editingUses ?? ["night montage"],
    },
  };
}

function legacyFromMetadataV2(metadata: ReturnType<typeof metadataV2>) {
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
    auth: {
      kind: "authenticated",
      isAuthenticated: true,
      hasWorkspaceIdentity: true,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createPrototypeContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "framefind-prototype-workspace",
      name: "Prototype Workspace",
      email: null,
      loginMethod: "prototype",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    auth: {
      kind: "prototype",
      isAuthenticated: false,
      hasWorkspaceIdentity: true,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("protected footage procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProjectClipMemberships.mockResolvedValue([]);
  });

  it("keeps My Library personal by returning no sample fallback when the user has no clips", async () => {
    mocks.listClipsForUser.mockResolvedValue([]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.personalList();

    expect(result).toEqual({ clips: [], mode: "personal" });
    expect(mocks.listClipsForUser).toHaveBeenCalledWith(9, undefined);
  });

  it("returns the authenticated creator's uploaded clips through My Library", async () => {
    mocks.listProjectClipMemberships.mockResolvedValue([
      { projectId: 12, clipId: 333 },
    ]);
    mocks.listClipsForUser.mockResolvedValue([
      {
        id: 333,
        userId: 9,
        fileName: "my-upload.mov",
        mimeType: "video/quicktime",
        sizeBytes: 128,
        durationMs: 1_200,
        status: "ready",
        storageKey: "clips/333.mov",
        mediaUrl: "/manus-storage/clips/333.mov",
        thumbnailUrl: null,
        description: "A quiet personal clip.",
        subjects: '["friend"]',
        setting: "train",
        timeOfDay: "night",
        lighting: '["low light"]',
        colors: '["blue"]',
        moods: '["quiet"]',
        shotType: "close",
        cameraMotion: "handheld",
        possibleUses: '["opening"]',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.personalList();

    expect(result.mode).toBe("personal");
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]).toMatchObject({
      id: 333,
      fileName: "my-upload.mov",
      mood: ["quiet"],
    });
    expect(result.clips[0].projectIds).toEqual([12]);

    const sample = await caller.footage.sampleList();
    expect(sample.mode).toBe("sample");
    expect(sample.clips).toHaveLength(8);
    expect(sample.clips.some(clip => clip.fileName === "my-upload.mov")).toBe(
      false
    );
  });

  it("searches only the authenticated user's requested project", async () => {
    const metadata = metadataV2({
      description: "a quiet train window at sunset",
      subjects: ["train", "window"],
      setting: "train interior",
      lighting: ["golden hour"],
      colors: ["amber"],
      mood: ["quiet"],
    });
    const legacy = legacyFromMetadataV2(metadata);
    mocks.listClipsForUser.mockResolvedValue([
      {
        id: 333,
        userId: 9,
        projectId: 12,
        clipKey: "clip_scoped",
        fileName: "scoped.mov",
        mimeType: "video/quicktime",
        sizeBytes: 128,
        durationMs: 1_200,
        status: "ready",
        storageKey: "clips/scoped.mov",
        mediaUrl: "/manus-storage/clips/scoped.mov",
        thumbnailKey: null,
        thumbnailUrl: null,
        description: legacy.description,
        subjects: JSON.stringify(legacy.subjects),
        setting: legacy.setting,
        timeOfDay: legacy.time,
        lighting: JSON.stringify(legacy.lighting),
        colors: JSON.stringify(legacy.colors),
        moods: JSON.stringify(legacy.mood),
        shotType: legacy.shotType,
        cameraMotion: legacy.cameraMotion,
        possibleUses: JSON.stringify(legacy.possibleUses),
        metadataJson: metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.personalSearch({
      query: "quiet train",
      projectId: 12,
    });

    expect(mocks.listClipsForUser).toHaveBeenCalledWith(9, 12);
    expect(result.clips.map(clip => clip.id)).toEqual([333]);
    expect(result.reasons[333]).toEqual(
      expect.arrayContaining(["subject: train", "mood: quiet"])
    );
  });

  it("returns prototype workspace clips through My Library without Manus authentication", async () => {
    mocks.listClipsForUser.mockResolvedValue([
      {
        id: 444,
        userId: 42,
        fileName: "prototype-upload.mov",
        mimeType: "video/quicktime",
        sizeBytes: 128,
        durationMs: 1_200,
        status: "ready",
        storageKey: "clips/444.mov",
        mediaUrl: "/manus-storage/clips/444.mov",
        thumbnailUrl: null,
        description: "A quiet prototype clip.",
        subjects: '["friend"]',
        setting: "lake",
        timeOfDay: "sunset",
        lighting: '["warm light"]',
        colors: '["gold"]',
        moods: '["quiet"]',
        shotType: "wide",
        cameraMotion: "static",
        possibleUses: '["memory montage"]',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const caller = appRouter.createCaller(createPrototypeContext());

    const result = await caller.footage.personalList();

    expect(result.mode).toBe("personal");
    expect(result.clips[0]).toMatchObject({
      id: 444,
      fileName: "prototype-upload.mov",
    });
    expect(mocks.listClipsForUser).toHaveBeenCalledWith(42, undefined);
  });

  it("creates an editing project and adds a clip to it for its owner", async () => {
    mocks.createEditingProject.mockResolvedValue({
      id: 77,
      userId: 9,
      name: "Night out",
      description: "Neon material",
      accent: "violet",
      isAiSuggested: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mocks.addClipToProject.mockResolvedValue(true);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const project = await caller.projects.create({
      name: "Night out",
      description: "Neon material",
    });
    const membership = await caller.footage.addToProject({
      projectId: 77,
      clipId: 101,
    });

    expect(project).toMatchObject({ id: 77, name: "Night out" });
    expect(mocks.createEditingProject).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, name: "Night out" })
    );
    expect(membership).toEqual({ success: true });
    expect(mocks.addClipToProject).toHaveBeenCalledWith({
      userId: 9,
      projectId: 77,
      clipId: 101,
    });
  });

  it("returns project clip counts and loose clips for the authenticated workspace", async () => {
    mocks.listEditingProjectsForUser.mockResolvedValue([
      {
        id: 77,
        userId: 9,
        name: "Night out",
        description: null,
        accent: "violet",
        isAiSuggested: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 78,
        userId: 9,
        name: "Loose ideas",
        description: null,
        accent: "amber",
        isAiSuggested: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mocks.listProjectClipMemberships.mockResolvedValue([
      { projectId: 77, clipId: 333 },
    ]);
    mocks.listClipsForUser.mockResolvedValue([
      { id: 333, userId: 9, fileName: "my-upload.mov" },
      { id: 334, userId: 9, fileName: "stray.mov" },
    ]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.projects.list();

    expect(result.projects).toEqual([
      expect.objectContaining({ id: 77, clipCount: 1 }),
      expect.objectContaining({ id: 78, clipCount: 0 }),
    ]);
    expect(result.unassignedCount).toBe(1);
    expect(mocks.listProjectClipMemberships).toHaveBeenCalledWith(9);
  });

  it("creates editing projects and scopes their clip counts to the authenticated workspace", async () => {
    mocks.createEditingProject.mockResolvedValue({
      id: 12,
      userId: 9,
      name: "Taipei diary",
      description: null,
      accent: "peach",
      isAiSuggested: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mocks.listEditingProjectsForUser.mockResolvedValue([
      {
        id: 12,
        userId: 9,
        name: "Taipei diary",
        description: null,
        accent: "peach",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mocks.listProjectClipMemberships.mockResolvedValue([
      { projectId: 12, clipId: 333 },
    ]);
    mocks.listClipsForUser.mockResolvedValue([
      { id: 333, userId: 9, fileName: "my-upload.mov" },
    ]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const project = await caller.projects.create({ name: "Taipei diary" });
    const list = await caller.projects.list();

    expect(project).toMatchObject({ id: 12, name: "Taipei diary" });
    expect(mocks.createEditingProject).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, name: "Taipei diary" })
    );
    expect(list.projects[0]).toMatchObject({ id: 12, clipCount: 1 });
    expect(list.unassignedCount).toBe(0);
  });

  it("scopes projects and clip memberships to the prototype workspace user", async () => {
    mocks.createEditingProject.mockResolvedValue({
      id: 18,
      userId: 42,
      name: "Summer memory",
      description: null,
      accent: "peach",
      isAiSuggested: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mocks.listEditingProjectsForUser.mockResolvedValue([
      {
        id: 18,
        userId: 42,
        name: "Summer memory",
        description: null,
        accent: "peach",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mocks.listProjectClipMemberships.mockResolvedValue([
      { projectId: 18, clipId: 444 },
    ]);
    mocks.listClipsForUser.mockResolvedValue([
      { id: 444, userId: 42, fileName: "prototype-upload.mov" },
    ]);
    mocks.addClipToProject.mockResolvedValue(true);
    mocks.removeClipFromProject.mockResolvedValue(true);
    const caller = appRouter.createCaller(createPrototypeContext());

    const project = await caller.projects.create({ name: "Summer memory" });
    const projects = await caller.projects.list();
    const added = await caller.footage.addToProject({
      projectId: 18,
      clipId: 444,
    });
    const removed = await caller.footage.removeFromProject({
      projectId: 18,
      clipId: 444,
    });

    expect(project).toMatchObject({ id: 18, userId: 42 });
    expect(projects.projects[0]).toMatchObject({ id: 18, clipCount: 1 });
    expect(added).toEqual({ success: true });
    expect(removed).toEqual({ success: true });
    expect(mocks.createEditingProject).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42 })
    );
    expect(mocks.listEditingProjectsForUser).toHaveBeenCalledWith(42);
    expect(mocks.addClipToProject).toHaveBeenCalledWith({
      userId: 42,
      projectId: 18,
      clipId: 444,
    });
    expect(mocks.removeClipFromProject).toHaveBeenCalledWith({
      userId: 42,
      projectId: 18,
      clipId: 444,
    });
  });

  it("derives suggested editing projects from the user's own clips", async () => {
    const clipRow = {
      id: 333,
      userId: 9,
      fileName: "my-upload.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 1_200,
      status: "ready",
      storageKey: "clips/333.mov",
      mediaUrl: "/manus-storage/clips/333.mov",
      thumbnailUrl: null,
      description: "A neon street at night.",
      subjects: '["street"]',
      setting: "city street",
      timeOfDay: "night",
      lighting: '["neon"]',
      colors: '["blue"]',
      moods: '["lively"]',
      shotType: "wide",
      cameraMotion: "static",
      possibleUses: '["night montage"]',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mocks.listClipsForUser.mockResolvedValue([
      { ...clipRow, id: 333 },
      { ...clipRow, id: 334 },
    ]);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.projects.suggestions();

    expect(
      result.projects.some(project => project.name === "Night stories")
    ).toBe(true);
    expect(result.projects[0]?.clipIds).toEqual([333, 334]);
    expect(mocks.listClipsForUser).toHaveBeenCalledWith(9);
  });

  it("adds to, removes from, renames, and deletes only clips available in the authenticated workspace", async () => {
    mocks.addClipToProject.mockResolvedValue(true);
    mocks.removeClipFromProject.mockResolvedValue(true);
    mocks.deleteClipForUser.mockResolvedValue(true);
    mocks.renameClipForUser.mockResolvedValue({
      id: 333,
      userId: 9,
      fileName: "Desert stretch.mov",
      mimeType: "video/quicktime",
      sizeBytes: 1200,
      durationMs: 8000,
      thumbnailKey: "thumb.jpg",
      thumbnailUrl: "/manus-storage/thumb.jpg",
      mediaUrl: "/manus-storage/video.mov",
      status: "ready",
      description: "quiet desert stretch",
      subjects: '["person"]',
      setting: "desert",
      timeOfDay: "twilight",
      lighting: '["natural"]',
      colors: '["sand"]',
      moods: '["quiet"]',
      shotType: "wide",
      cameraMotion: "static",
      possibleUses: '["opening"]',
      metadataJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(
      caller.footage.addToProject({ clipId: 333, projectId: 12 })
    ).resolves.toEqual({ success: true });
    await expect(
      caller.footage.removeFromProject({ clipId: 333, projectId: 12 })
    ).resolves.toEqual({ success: true });
    await expect(
      caller.footage.rename({ clipId: 333, fileName: "Desert stretch.mov" })
    ).resolves.toMatchObject({
      clip: { id: 333, fileName: "Desert stretch.mov" },
    });
    await expect(caller.footage.delete({ clipId: 333 })).resolves.toEqual({
      success: true,
    });
    expect(mocks.addClipToProject).toHaveBeenCalledWith({
      userId: 9,
      clipId: 333,
      projectId: 12,
    });
    expect(mocks.removeClipFromProject).toHaveBeenCalledWith({
      userId: 9,
      clipId: 333,
      projectId: 12,
    });
    expect(mocks.renameClipForUser).toHaveBeenCalledWith({
      userId: 9,
      clipId: 333,
      fileName: "Desert stretch.mov",
    });
    expect(mocks.deleteClipForUser).toHaveBeenCalledWith({
      userId: 9,
      clipId: 333,
    });
  });

  it("analyzes multiple sampled frames in chronological order while keeping the first frame as thumbnail", async () => {
    const metadata = metadataV2({
      description:
        "a person walks through a neon street at night with a lively urban feel",
      subjects: ["person", "street"],
      setting: "city street",
      time: "night",
      lighting: ["neon"],
      colors: ["blue", "magenta"],
      mood: ["lively"],
      shotType: "medium",
      cameraMotion: "unknown",
      editingUses: ["night montage"],
    });
    const legacy = legacyFromMetadataV2(metadata);
    mocks.analyzeFrames.mockResolvedValue(JSON.stringify(metadata));
    mocks.storagePut.mockResolvedValue({
      key: "thumbs/sample.jpg",
      url: "/manus-storage/thumbs/sample.jpg",
    });
    mocks.createAnalyzedClip.mockResolvedValue({
      id: 444,
      userId: 9,
      projectId: null,
      fileName: "night.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 4_000,
      status: "uploading",
      storageKey: null,
      mediaUrl: null,
      thumbnailKey: "thumbs/sample.jpg",
      thumbnailUrl: "/manus-storage/thumbs/sample.jpg",
      description: legacy.description,
      subjects: JSON.stringify(legacy.subjects),
      setting: legacy.setting,
      timeOfDay: legacy.time,
      lighting: JSON.stringify(legacy.lighting),
      colors: JSON.stringify(legacy.colors),
      moods: JSON.stringify(legacy.mood),
      shotType: legacy.shotType,
      cameraMotion: legacy.cameraMotion,
      possibleUses: JSON.stringify(legacy.possibleUses),
      metadataJson: metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.analyzeFrame({
      fileName: "night.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 4_000,
      previewDataUrl: "data:image/jpeg;base64,first",
      previewDataUrls: [
        "data:image/jpeg;base64,first",
        "data:image/jpeg;base64,second",
        "data:image/jpeg;base64,third",
      ],
    });

    expect(result.clip).toMatchObject({
      id: 444,
      description: metadata.description,
      cameraMotion: "unknown",
    });
    expect(mocks.storagePut).toHaveBeenCalledWith(
      expect.stringContaining("night.mov.jpg"),
      expect.any(Buffer),
      "image/jpeg"
    );
    expect(mocks.createAnalyzedClip).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata,
        thumbnailUrl: "/manus-storage/thumbs/sample.jpg",
      })
    );
    expect(mocks.analyzeFrames).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "night.mov",
        previewDataUrls: [
          "data:image/jpeg;base64,first",
          "data:image/jpeg;base64,second",
          "data:image/jpeg;base64,third",
        ],
        responseSchema: expect.objectContaining({
          name: "footage_metadata",
          strict: true,
        }),
      })
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "unknown"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "visibleFacts"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "actions"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "spatialRelationships"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "atmosphere"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "weather"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "environmentType"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "socialContext"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "activityLevel"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "visualDensity"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "cameraMotion is weak"
    );
    expect(JSON.stringify(mocks.analyzeFrames.mock.calls[0]?.[0])).toContain(
      "Do not infer or describe race"
    );
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("normalizes a single-object array frame analysis response", async () => {
    const metadata = metadataV2({
      description:
        "a person sits by a warm lake at sunset in a quiet reflective shot",
      subjects: ["person", "lake"],
      setting: "lakeside",
      time: "sunset",
      lighting: ["warm light"],
      colors: ["gold"],
      mood: ["quiet"],
      shotType: "wide",
      cameraMotion: "static",
      editingUses: ["memory montage"],
    });
    mocks.analyzeFrames.mockResolvedValue(JSON.stringify([metadata]));
    mocks.storagePut.mockResolvedValue({
      key: "thumbs/array.jpg",
      url: "/manus-storage/thumbs/array.jpg",
    });
    mocks.createAnalyzedClip.mockImplementation(async input => ({
      id: 556,
      userId: input.userId,
      projectId: null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      durationMs: input.durationMs,
      status: "uploading",
      storageKey: null,
      mediaUrl: null,
      thumbnailKey: input.thumbnailKey,
      thumbnailUrl: input.thumbnailUrl,
      description: input.metadata.description,
      subjects: JSON.stringify(input.metadata.observed.subjects),
      setting: input.metadata.observed.setting,
      timeOfDay: input.metadata.observed.time,
      lighting: JSON.stringify(input.metadata.observed.lighting),
      colors: JSON.stringify(input.metadata.observed.colors),
      moods: JSON.stringify(input.metadata.interpretation.mood),
      shotType: input.metadata.observed.shotType,
      cameraMotion: input.metadata.observed.cameraMotion,
      possibleUses: JSON.stringify(input.metadata.creative.editingUses),
      metadataJson: input.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const caller = appRouter.createCaller(createPrototypeContext());

    const result = await caller.footage.analyzeFrame({
      fileName: "array.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 4_000,
      previewDataUrl: "data:image/jpeg;base64,first",
    });

    expect(result.clip).toMatchObject({
      id: 556,
      description: metadata.description,
    });
    expect(mocks.createAnalyzedClip).toHaveBeenCalledWith(
      expect.objectContaining({ metadata })
    );
  });

  it("rejects multi-object array frame analysis responses", async () => {
    const metadata = metadataV2({
      description:
        "a person sits by a warm lake at sunset in a quiet reflective shot",
      subjects: ["person", "lake"],
      setting: "lakeside",
      time: "sunset",
      lighting: ["warm light"],
      colors: ["gold"],
      mood: ["quiet"],
      shotType: "wide",
      cameraMotion: "static",
      editingUses: ["memory montage"],
    });
    mocks.analyzeFrames.mockResolvedValue(JSON.stringify([metadata, metadata]));
    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(
      caller.footage.analyzeFrame({
        fileName: "multi.mov",
        mimeType: "video/quicktime",
        sizeBytes: 128,
        durationMs: 4_000,
        previewDataUrl: "data:image/jpeg;base64,first",
      })
    ).rejects.toThrow("AI analysis metadata must be exactly one JSON object.");

    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.createAnalyzedClip).not.toHaveBeenCalled();
  });

  it("rejects incomplete Metadata V2 frame analysis responses", async () => {
    mocks.analyzeFrames.mockResolvedValue(
      JSON.stringify({ description: "missing structured metadata" })
    );
    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(
      caller.footage.analyzeFrame({
        fileName: "incomplete.mov",
        mimeType: "video/quicktime",
        sizeBytes: 128,
        durationMs: 4_000,
        previewDataUrl: "data:image/jpeg;base64,first",
      })
    ).rejects.toThrow();

    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.createAnalyzedClip).not.toHaveBeenCalled();
  });

  it.each([
    ["null", "null"],
    ["primitive", '"not an object"'],
  ])("rejects %s frame analysis responses", async (_label, raw) => {
    mocks.analyzeFrames.mockResolvedValue(raw);
    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(
      caller.footage.analyzeFrame({
        fileName: "bad.mov",
        mimeType: "video/quicktime",
        sizeBytes: 128,
        durationMs: 4_000,
        previewDataUrl: "data:image/jpeg;base64,first",
      })
    ).rejects.toThrow("AI analysis metadata must be exactly one JSON object.");

    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.createAnalyzedClip).not.toHaveBeenCalled();
  });

  it("analyzes and creates clips in the prototype workspace without Manus authentication", async () => {
    const metadata = metadataV2({
      description: "a quiet sunset lake clip with a reflective warm feeling",
      subjects: ["lake"],
      setting: "lakeside",
      time: "sunset",
      lighting: ["warm light"],
      colors: ["gold"],
      mood: ["reflective"],
      shotType: "wide",
      cameraMotion: "static",
      editingUses: ["closing moment"],
    });
    const legacy = legacyFromMetadataV2(metadata);
    mocks.analyzeFrames.mockResolvedValue(JSON.stringify(metadata));
    mocks.storagePut.mockResolvedValue({
      key: "thumbs/prototype.jpg",
      url: "/manus-storage/thumbs/prototype.jpg",
    });
    mocks.createAnalyzedClip.mockResolvedValue({
      id: 555,
      userId: 42,
      projectId: null,
      fileName: "lake.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 4_000,
      status: "uploading",
      storageKey: null,
      mediaUrl: null,
      thumbnailKey: "thumbs/prototype.jpg",
      thumbnailUrl: "/manus-storage/thumbs/prototype.jpg",
      description: legacy.description,
      subjects: JSON.stringify(legacy.subjects),
      setting: legacy.setting,
      timeOfDay: legacy.time,
      lighting: JSON.stringify(legacy.lighting),
      colors: JSON.stringify(legacy.colors),
      moods: JSON.stringify(legacy.mood),
      shotType: legacy.shotType,
      cameraMotion: legacy.cameraMotion,
      possibleUses: JSON.stringify(legacy.possibleUses),
      metadataJson: metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createPrototypeContext());

    const result = await caller.footage.analyzeFrame({
      fileName: "lake.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 4_000,
      previewDataUrl: "data:image/jpeg;base64,first",
    });

    expect(result.clip).toMatchObject({ id: 555, fileName: "lake.mov" });
    expect(mocks.storagePut).toHaveBeenCalledWith(
      expect.stringContaining("framefind/42/thumbnails"),
      expect.any(Buffer),
      "image/jpeg"
    );
    expect(mocks.createAnalyzedClip).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, metadata })
    );
    expect(mocks.analyzeFrames).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "lake.mov",
        previewDataUrls: ["data:image/jpeg;base64,first"],
      })
    );
  });

  it("stops before storage and clip creation when frame analysis fails", async () => {
    mocks.analyzeFrames.mockRejectedValue(
      new Error(
        "Qwen frame analysis failed: 401 Unauthorized - invalid API key"
      )
    );
    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(
      caller.footage.analyzeFrame({
        fileName: "night.mov",
        mimeType: "video/quicktime",
        sizeBytes: 128,
        durationMs: 4_000,
        previewDataUrl: "data:image/jpeg;base64,first",
      })
    ).rejects.toThrow(
      "Qwen frame analysis failed: 401 Unauthorized - invalid API key"
    );

    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.createAnalyzedClip).not.toHaveBeenCalled();
  });

  it("returns a grounded creative answer when selected footage metadata is available", async () => {
    mocks.listClipsForUser.mockResolvedValue([]);
    mocks.invokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              "Start on the blue night street, then cut to the ramen detail for contrast.",
          },
        },
      ],
    });
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const result = await caller.footage.ask({
      question: "What could make a strong opening?",
      clipIds: [101, 103],
    });

    expect(result.answer).toContain("blue night street");
    expect(mocks.invokeLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" })
    );
    const userContent = mocks.invokeLLM.mock.calls[0]?.[0]?.messages?.find(
      (message: { role: string }) => message.role === "user"
    )?.content;
    expect(userContent).toContain("IMG_4821.MOV");
    expect(userContent).toContain("IMG_4887.MOV");
    expect(userContent).toContain('"observed"');
    expect(userContent).toContain('"interpretation"');
    expect(userContent).toContain('"creative"');
    expect(userContent).not.toContain('"possibleUses"');
  });
});
