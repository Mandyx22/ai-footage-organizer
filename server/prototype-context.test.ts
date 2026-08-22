import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getOrCreatePrototypeUser: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: mocks.authenticateRequest,
  },
}));

vi.mock("./db", () => ({
  getOrCreatePrototypeUser: mocks.getOrCreatePrototypeUser,
}));

import { createContext } from "./_core/context";

function user(id: number, openId: string, loginMethod = "manus") {
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

describe("prototype workspace context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the real authenticated user when Manus authentication succeeds", async () => {
    const authenticated = user(9, "real-creator");
    mocks.authenticateRequest.mockResolvedValue(authenticated);

    const ctx = await createContext(contextOptions());

    expect(ctx.user).toBe(authenticated);
    expect(ctx.auth).toEqual({
      kind: "authenticated",
      isAuthenticated: true,
      hasWorkspaceIdentity: true,
    });
    expect(mocks.getOrCreatePrototypeUser).not.toHaveBeenCalled();
  });

  it("falls back to the persisted prototype user when authentication is absent", async () => {
    const prototype = user(42, "framefind-prototype-workspace", "prototype");
    mocks.authenticateRequest.mockRejectedValue(new Error("no session"));
    mocks.getOrCreatePrototypeUser.mockResolvedValue(prototype);

    const ctx = await createContext(contextOptions());

    expect(ctx.user).toBe(prototype);
    expect(ctx.auth).toEqual({
      kind: "prototype",
      isAuthenticated: false,
      hasWorkspaceIdentity: true,
    });
  });
});
