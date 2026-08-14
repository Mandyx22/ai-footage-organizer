import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn(),
  addClipToCollection: vi.fn(),
  listClipsForUser: vi.fn(),
  listLLMModels: vi.fn(),
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => ({
  createCollection: mocks.createCollection,
  addClipToCollection: mocks.addClipToCollection,
  listClipsForUser: mocks.listClipsForUser,
  listCollectionsForUser: vi.fn(async () => []),
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
