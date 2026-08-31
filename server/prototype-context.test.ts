import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreatePrototypeUser: vi.fn(),
}));

vi.mock("./db", () => ({
  getOrCreatePrototypeUser: mocks.getOrCreatePrototypeUser,
}));

import { createContext } from "./_core/context";

function user(id: number, openId: string, loginMethod = "prototype") {
  return {
    id,
    openId,
    name: openId,
    email: null,
    loginMethod,
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function contextOptions() {
  return {
    req: { headers: {} },
    res: {},
    info: {},
  } as Parameters<typeof createContext>[0];
}

describe("single-user workspace context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always binds every request to the persisted workspace user", async () => {
    const prototype = user(42, "framefind-prototype-workspace");
    mocks.getOrCreatePrototypeUser.mockResolvedValue(prototype);

    const ctx = await createContext(contextOptions());

    expect(ctx.user).toBe(prototype);
    expect(ctx.auth).toEqual({
      kind: "prototype",
      isAuthenticated: false,
      hasWorkspaceIdentity: true,
    });
    expect(mocks.getOrCreatePrototypeUser).toHaveBeenCalledTimes(1);
  });
});
