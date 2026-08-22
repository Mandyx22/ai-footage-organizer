import { and, count, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  Clip,
  clips,
  collections,
  collectionClips,
  editingProjects,
  InsertUser,
  users,
  type User,
} from "../drizzle/schema";
import { metadataV2ToLegacy, type ClipMetadataV2 } from "./footage";
import { ENV } from "./_core/env";

export const PROTOTYPE_USER_OPEN_ID = "framefind-prototype-workspace";

let _db: ReturnType<typeof drizzle> | null = null;
let cachedPrototypeUser: User | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    openId: user.openId,
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  const updateSet: Record<string, unknown> = {
    lastSignedIn: values.lastSignedIn,
  };
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role =
    user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getOrCreatePrototypeUser() {
  if (cachedPrototypeUser) return cachedPrototypeUser;

  const existing = await getUserByOpenId(PROTOTYPE_USER_OPEN_ID);
  if (existing) {
    cachedPrototypeUser = existing;
    return existing;
  }

  await upsertUser({
    openId: PROTOTYPE_USER_OPEN_ID,
    name: "Prototype Workspace",
    email: null,
    loginMethod: "prototype",
    role: "user",
    lastSignedIn: new Date(),
  });
  cachedPrototypeUser = (await getUserByOpenId(PROTOTYPE_USER_OPEN_ID)) ?? null;
  return cachedPrototypeUser;
}

export async function listClipsForUser(
  userId: number,
  projectId?: number | null
) {
  const db = await getDb();
  if (!db) return [];
  const condition =
    projectId === undefined
      ? eq(clips.userId, userId)
      : projectId === null
        ? and(eq(clips.userId, userId), isNull(clips.projectId))
        : and(eq(clips.userId, userId), eq(clips.projectId, projectId));
  return db
    .select()
    .from(clips)
    .where(condition)
    .orderBy(desc(clips.createdAt));
}

export async function getClipById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clips).where(eq(clips.id, id)).limit(1);
  return result[0];
}

export async function createAnalyzedClip(input: {
  userId: number;
  projectId?: number | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  thumbnailKey: string;
  thumbnailUrl: string;
  metadata: ClipMetadataV2;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const clipKey = `clip_${nanoid(14)}`;
  const legacyMetadata = metadataV2ToLegacy(input.metadata);
  await db.insert(clips).values({
    userId: input.userId,
    projectId: input.projectId ?? null,
    clipKey,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs,
    thumbnailKey: input.thumbnailKey,
    thumbnailUrl: input.thumbnailUrl,
    status: "uploading",
    description: legacyMetadata.description,
    subjects: JSON.stringify(legacyMetadata.subjects),
    setting: legacyMetadata.setting,
    timeOfDay: legacyMetadata.time,
    lighting: JSON.stringify(legacyMetadata.lighting),
    colors: JSON.stringify(legacyMetadata.colors),
    moods: JSON.stringify(legacyMetadata.mood),
    shotType: legacyMetadata.shotType,
    cameraMotion: legacyMetadata.cameraMotion,
    possibleUses: JSON.stringify(legacyMetadata.possibleUses),
    metadataJson: input.metadata,
  });
  const result = await db
    .select()
    .from(clips)
    .where(eq(clips.clipKey, clipKey))
    .limit(1);
  return result[0];
}

export async function attachClipMedia(input: {
  clipId: number;
  userId: number;
  storageKey: string;
  mediaUrl: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  await db
    .update(clips)
    .set({
      storageKey: input.storageKey,
      mediaUrl: input.mediaUrl,
      status: "ready",
    })
    .where(and(eq(clips.id, input.clipId), eq(clips.userId, input.userId)));
  return getClipById(input.clipId);
}

export async function deleteClipForUser(input: {
  clipId: number;
  userId: number;
}) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .delete(clips)
    .where(and(eq(clips.id, input.clipId), eq(clips.userId, input.userId)));
  return result[0].affectedRows > 0;
}

export async function listEditingProjectsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(editingProjects)
    .where(eq(editingProjects.userId, userId))
    .orderBy(desc(editingProjects.updatedAt));
}

export async function createEditingProject(input: {
  userId: number;
  name: string;
  description?: string;
  accent?: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  await db
    .insert(editingProjects)
    .values({
      userId: input.userId,
      name: input.name,
      description: input.description ?? null,
      accent: input.accent ?? "peach",
    });
  const rows = await listEditingProjectsForUser(input.userId);
  return rows[0];
}

export async function userOwnsEditingProject(input: {
  userId: number;
  projectId: number;
}) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: editingProjects.id })
    .from(editingProjects)
    .where(
      and(
        eq(editingProjects.id, input.projectId),
        eq(editingProjects.userId, input.userId)
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function moveClipToEditingProject(input: {
  userId: number;
  clipId: number;
  projectId: number | null;
}) {
  const db = await getDb();
  if (!db) return false;
  if (
    input.projectId !== null &&
    !(await userOwnsEditingProject({
      userId: input.userId,
      projectId: input.projectId,
    }))
  )
    return false;
  const result = await db
    .update(clips)
    .set({ projectId: input.projectId })
    .where(and(eq(clips.id, input.clipId), eq(clips.userId, input.userId)));
  return result[0].affectedRows > 0;
}

export async function listCollectionsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.createdAt));
}

export async function listCollectionClipCountsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ collectionId: collectionClips.collectionId, clipCount: count() })
    .from(collectionClips)
    .innerJoin(collections, eq(collections.id, collectionClips.collectionId))
    .where(eq(collections.userId, userId))
    .groupBy(collectionClips.collectionId);
}

export async function createCollection(input: {
  userId: number;
  name: string;
  description?: string;
  accent?: string;
  isAiSuggested?: boolean;
}) {
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(collections).values({
    userId: input.userId,
    name: input.name,
    description: input.description ?? null,
    accent: input.accent ?? "violet",
    isAiSuggested: input.isAiSuggested ?? false,
  });
  const rows = await listCollectionsForUser(input.userId);
  return rows[0];
}

export async function addClipToCollection(input: {
  userId: number;
  collectionId: number;
  clipId: number;
}) {
  const db = await getDb();
  if (!db) return false;
  const ownedCollection = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.id, input.collectionId),
        eq(collections.userId, input.userId)
      )
    )
    .limit(1);
  const ownedClip = await db
    .select()
    .from(clips)
    .where(and(eq(clips.id, input.clipId), eq(clips.userId, input.userId)))
    .limit(1);
  if (!ownedCollection[0] || !ownedClip[0]) return false;
  await db
    .insert(collectionClips)
    .values({ collectionId: input.collectionId, clipId: input.clipId })
    .onDuplicateKeyUpdate({ set: { addedAt: new Date() } });
  return true;
}

export type { Clip };
