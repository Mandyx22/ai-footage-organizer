import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    auth: {
      kind: "none",
      isAuthenticated: false,
      hasWorkspaceIdentity: false,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("footage router", () => {
  it("returns a clearly marked, stable read-only sample library", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.footage.sampleList();

    expect(result.mode).toBe("sample");
    expect(result.clips).toHaveLength(8);
    expect(result.clips.map(clip => clip.id)).toContain(104);
  });

  it("searches and finds similar clips within the isolated sample library", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const search = await caller.footage.sampleSearch({ query: "quiet blue night shots" });
    const similar = await caller.footage.sampleSimilar({ clipId: 101, dimension: "color" });

    expect(search.mode).toBe("sample");
    expect(search.clips[0]?.id).toBe(104);
    expect(similar.mode).toBe("sample");
    expect(similar.clips.map(clip => clip.id)).not.toContain(101);
  });

  it("returns explainable semantic-search results from the sample workspace", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.footage.search({ query: "quiet blue night shots" });

    expect(result.query).toBe("quiet blue night shots");
    expect(result.clips[0]?.id).toBe(104);
    expect(result.scores[104]).toBeGreaterThan(0);
  });

  it("returns dimensional similar-shot results without the reference clip", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.footage.similar({ clipId: 101, dimension: "color" });

    expect(result.dimension).toBe("color");
    expect(result.clips.map(clip => clip.id)).not.toContain(101);
    expect(result.clips.map(clip => clip.id)).toContain(104);
  });

  it("derives thematic collection suggestions from available clips", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.collections.suggestions();

    expect(result.collections.some(collection => collection.name === "Night stories")).toBe(true);
    expect(result.collections.every(collection => collection.clipCount >= 2)).toBe(true);
  });

  it("returns a helpful error when creative guidance has no selected clip context", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.footage.ask({ question: "What opening could this make?", clipIds: [9999] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("keeps workspace-changing collection procedures protected", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.collections.create({ name: "Night out" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.collections.addClip({ collectionId: 1, clipId: 101 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
