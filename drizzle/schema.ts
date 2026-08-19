import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const clipStatus = mysqlEnum("clipStatus", [
  "uploading",
  "analyzing",
  "ready",
  "failed",
]);

export const editingProjects = mysqlTable(
  "editingProjects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    accent: varchar("accent", { length: 30 }).notNull().default("peach"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("editing_projects_user_created_idx").on(table.userId, table.createdAt)],
);

export const clips = mysqlTable(
  "clips",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").references(() => editingProjects.id, { onDelete: "set null" }),
    clipKey: varchar("clipKey", { length: 32 }).notNull().unique(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 100 }).notNull(),
    sizeBytes: int("sizeBytes").notNull().default(0),
    durationMs: int("durationMs").notNull().default(0),
    storageKey: text("storageKey"),
    mediaUrl: text("mediaUrl"),
    thumbnailKey: text("thumbnailKey"),
    thumbnailUrl: text("thumbnailUrl"),
    status: mysqlEnum("clipStatus", [
      "uploading",
      "analyzing",
      "ready",
      "failed",
    ]).notNull().default("uploading"),
    description: text("description").notNull(),
    subjects: text("subjects").notNull(),
    setting: varchar("setting", { length: 255 }).notNull(),
    timeOfDay: varchar("timeOfDay", { length: 80 }).notNull(),
    lighting: text("lighting").notNull(),
    colors: text("colors").notNull(),
    moods: text("moods").notNull(),
    shotType: varchar("shotType", { length: 80 }).notNull(),
    cameraMotion: varchar("cameraMotion", { length: 120 }).notNull(),
    possibleUses: text("possibleUses").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("clips_user_created_idx").on(table.userId, table.createdAt), index("clips_user_status_idx").on(table.userId, table.status), index("clips_project_created_idx").on(table.projectId, table.createdAt)],
);

export const collections = mysqlTable(
  "collections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    accent: varchar("accent", { length: 30 }).notNull().default("violet"),
    isAiSuggested: boolean("isAiSuggested").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("collections_user_created_idx").on(table.userId, table.createdAt)],
);

export const collectionClips = mysqlTable(
  "collectionClips",
  {
    collectionId: int("collectionId").notNull().references(() => collections.id, { onDelete: "cascade" }),
    clipId: int("clipId").notNull().references(() => clips.id, { onDelete: "cascade" }),
    addedAt: timestamp("addedAt").defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.collectionId, table.clipId] }),
    index("collection_clips_clip_idx").on(table.clipId),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Clip = typeof clips.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type EditingProject = typeof editingProjects.$inferSelect;
