import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getOrCreatePrototypeUser } from "../db";

export type AuthContext = {
  kind: "prototype";
  isAuthenticated: false;
  hasWorkspaceIdentity: true;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User;
  auth: AuthContext;
};

// Single-user local workspace: every request is bound to the one persisted
// prototype user. There is no login, session, or authentication surface.
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = (await getOrCreatePrototypeUser()) ?? null;
  if (!user) {
    throw new Error(
      "Workspace user could not be resolved; check the database connection."
    );
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    auth: {
      kind: "prototype",
      isAuthenticated: false,
      hasWorkspaceIdentity: true,
    },
  };
}
