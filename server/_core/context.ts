import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getOrCreatePrototypeUser } from "../db";
import { sdk } from "./sdk";

export type AuthContext =
  | { kind: "authenticated"; isAuthenticated: true; hasWorkspaceIdentity: true }
  | { kind: "prototype"; isAuthenticated: false; hasWorkspaceIdentity: true }
  | { kind: "none"; isAuthenticated: false; hasWorkspaceIdentity: false };

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  auth: AuthContext;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let auth: AuthContext = {
    kind: "none",
    isAuthenticated: false,
    hasWorkspaceIdentity: false,
  };

  try {
    user = await sdk.authenticateRequest(opts.req);
    auth = {
      kind: "authenticated",
      isAuthenticated: true,
      hasWorkspaceIdentity: true,
    };
  } catch (error) {
    // Local/single-user MVP fallback: unauthenticated requests share one
    // persisted prototype workspace. This is not anonymous-user isolation.
    user = await getOrCreatePrototypeUser() ?? null;
    if (user) {
      auth = {
        kind: "prototype",
        isAuthenticated: false,
        hasWorkspaceIdentity: true,
      };
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    auth,
  };
}
