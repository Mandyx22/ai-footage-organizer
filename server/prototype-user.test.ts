import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drizzle: vi.fn(),
  insert: vi.fn(),
  onDuplicateKeyUpdate: vi.fn(),
  selectRows: [] as unknown[][],
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: mocks.drizzle,
}));

function prototypeUser() {
  return {
    id: 42,
    openId: "framefind-prototype-workspace",
    name: "Prototype Workspace",
    email: null,
    loginMethod: "prototype",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function queryChain() {
  return {
    from: () => ({
      where: () => ({
        limit: async () => mocks.selectRows.shift() ?? [],
      }),
    }),
  };
}

function insertChain() {
  return {
    values: mocks.insert.mockImplementation(() => ({
      onDuplicateKeyUpdate: mocks.onDuplicateKeyUpdate.mockResolvedValue(undefined),
    })),
  };
}

async function loadDbModule() {
  vi.resetModules();
  process.env.DATABASE_URL = "mysql://user:password@example.invalid:3306/db";
  mocks.drizzle.mockReturnValue({
    select: vi.fn(queryChain),
    insert: vi.fn(insertChain),
  });
  return import("./db");
}

describe("prototype workspace user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows = [];
  });

  it("returns an existing prototype user without issuing an upsert write", async () => {
    const existing = prototypeUser();
    mocks.selectRows = [[existing]];
    const { getOrCreatePrototypeUser } = await loadDbModule();

    const result = await getOrCreatePrototypeUser();

    expect(result).toBe(existing);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.onDuplicateKeyUpdate).not.toHaveBeenCalled();
  });

  it("creates and returns the prototype user when it is missing", async () => {
    const created = prototypeUser();
    mocks.selectRows = [[], [created]];
    const { getOrCreatePrototypeUser } = await loadDbModule();

    const result = await getOrCreatePrototypeUser();

    expect(result).toBe(created);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.onDuplicateKeyUpdate).toHaveBeenCalledOnce();
  });
});
