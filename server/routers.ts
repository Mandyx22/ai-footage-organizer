import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { buildCollectionSuggestions, DEMO_CLIPS, rankFootage, rankSimilar, toFootageClip, type ClipMetadata, type FootageClip } from "./footage";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";

const metadataSchema = z.object({
  description: z.string(),
  subjects: z.array(z.string()),
  setting: z.string(),
  time: z.string(),
  lighting: z.array(z.string()),
  colors: z.array(z.string()),
  mood: z.array(z.string()),
  shotType: z.string(),
  cameraMotion: z.string(),
  possibleUses: z.array(z.string()),
}).strict();

const demoCollections = [
  { id: -1, name: "Tokyo after dark", description: "Neon, rain and shared nights.", accent: "violet", isAiSuggested: true, clipCount: 3 },
  { id: -2, name: "Quiet in-between", description: "Soft pauses to slow the edit down.", accent: "amber", isAiSuggested: true, clipCount: 2 },
  { id: -3, name: "Warm daylight", description: "Morning movement and golden details.", accent: "lime", isAiSuggested: false, clipCount: 2 },
];

async function modelId(preferred: string, fallback: string) {
  const { data } = await listLLMModels();
  return data.find(model => model.id === preferred)?.id ?? data.find(model => model.id === fallback)?.id;
}

async function clipsFor(userId?: number | null): Promise<FootageClip[]> {
  if (!userId) return DEMO_CLIPS;
  const saved = await db.listClipsForUser(userId);
  return saved.length ? saved.map(toFootageClip) : DEMO_CLIPS;
}

async function analyzeRepresentativeFrame(input: { fileName: string; previewDataUrl: string }) {
  const selectedModel = await modelId("gemini-3-flash-preview", "gpt-5-mini");
  const result = await invokeLLM({
    model: selectedModel,
    messages: [
      { role: "system", content: "You analyze a single representative video frame for a personal footage library. Infer only what is visually supported. Return compact, searchable metadata in the exact schema. Use lower-case concise English tags; mood must be framed as a reasonable visual impression, not a fact." },
      {
        role: "user",
        content: [
          { type: "text", text: `Analyze this representative frame from ${input.fileName}.` },
          { type: "image_url", image_url: { url: input.previewDataUrl, detail: "low" } },
        ] as any,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "footage_metadata",
        strict: true,
        schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            subjects: { type: "array", items: { type: "string" } },
            setting: { type: "string" },
            time: { type: "string" },
            lighting: { type: "array", items: { type: "string" } },
            colors: { type: "array", items: { type: "string" } },
            mood: { type: "array", items: { type: "string" } },
            shotType: { type: "string" },
            cameraMotion: { type: "string" },
            possibleUses: { type: "array", items: { type: "string" } },
          },
          required: ["description", "subjects", "setting", "time", "lighting", "colors", "mood", "shotType", "cameraMotion", "possibleUses"],
          additionalProperties: false,
        },
      },
    },
  });
  const raw = result.choices[0]?.message.content;
  if (typeof raw !== "string" || !raw) throw new TRPCError({ code: "BAD_GATEWAY", message: "AI analysis returned no metadata." });
  return metadataSchema.parse(JSON.parse(raw)) as ClipMetadata;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  footage: router({
    sampleList: publicProcedure.query(() => ({ clips: DEMO_CLIPS, mode: "sample" as const })),
    sampleSearch: publicProcedure.input(z.object({ query: z.string().trim().max(160) })).query(({ input }) => {
      const ranked = rankFootage(DEMO_CLIPS, input.query);
      return { clips: ranked.map(item => item.clip), scores: Object.fromEntries(ranked.map(item => [item.clip.id, item.score])), query: input.query, mode: "sample" as const };
    }),
    sampleSimilar: publicProcedure.input(z.object({ clipId: z.number().int(), dimension: z.enum(["all", "color", "mood", "lighting", "subject", "composition", "motion"]).default("all") })).query(({ input }) => ({ clips: rankSimilar(DEMO_CLIPS, input.clipId, input.dimension).map(item => item.clip), dimension: input.dimension, mode: "sample" as const })),
    list: publicProcedure.query(async ({ ctx }) => {
      const source = await clipsFor(ctx.user?.id);
      return { clips: source, mode: source === DEMO_CLIPS ? "sample" as const : "personal" as const };
    }),
    search: publicProcedure.input(z.object({ query: z.string().trim().max(160) })).query(async ({ ctx, input }) => {
      const source = await clipsFor(ctx.user?.id);
      const ranked = rankFootage(source, input.query);
      return { clips: ranked.map(item => item.clip), scores: Object.fromEntries(ranked.map(item => [item.clip.id, item.score])), query: input.query };
    }),
    similar: publicProcedure.input(z.object({ clipId: z.number().int(), dimension: z.enum(["all", "color", "mood", "lighting", "subject", "composition", "motion"]).default("all") })).query(async ({ ctx, input }) => {
      const source = await clipsFor(ctx.user?.id);
      return { clips: rankSimilar(source, input.clipId, input.dimension).map(item => item.clip), dimension: input.dimension };
    }),
    analyzeFrame: protectedProcedure.input(z.object({
      fileName: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      sizeBytes: z.number().int().min(0).max(52_428_800),
      durationMs: z.number().int().min(0).max(21_600_000),
      previewDataUrl: z.string().startsWith("data:image/").max(8_000_000),
    })).mutation(async ({ ctx, input }) => {
      const metadata = await analyzeRepresentativeFrame(input);
      const match = input.previewDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Preview frame format is not supported." });
      const extension = match[1].includes("png") ? "png" : "jpg";
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const thumbnail = await storagePut(`framefind/${ctx.user.id}/thumbnails/${safeName}.${extension}`, Buffer.from(match[2], "base64"), match[1]);
      const clip = await db.createAnalyzedClip({ ...input, userId: ctx.user.id, thumbnailKey: thumbnail.key, thumbnailUrl: thumbnail.url, metadata });
      if (!clip) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create your footage record." });
      return { clip: toFootageClip(clip) };
    }),
    ask: publicProcedure.input(z.object({ question: z.string().trim().min(3).max(600), clipIds: z.array(z.number().int()).min(1).max(30) })).mutation(async ({ ctx, input }) => {
      const source = await clipsFor(ctx.user?.id);
      const selected = source.filter(clip => input.clipIds.includes(clip.id));
      if (!selected.length) throw new TRPCError({ code: "NOT_FOUND", message: "Select at least one clip from this workspace first." });
      const selectedModel = await modelId("gpt-5-mini", "gemini-3-flash-preview");
      const context = selected.map(clip => ({ fileName: clip.fileName, durationSeconds: Math.round(clip.durationMs / 100) / 10, description: clip.description, subjects: clip.subjects, setting: clip.setting, time: clip.time, lighting: clip.lighting, colors: clip.colors, mood: clip.mood, shotType: clip.shotType, cameraMotion: clip.cameraMotion, possibleUses: clip.possibleUses }));
      const response = await invokeLLM({
        model: selectedModel,
        messages: [
          { role: "system", content: "You are Framefind, a thoughtful creative retrieval assistant. Answer only from the supplied footage metadata. Be specific, encouraging, and concise. Do not invent clips or claim you watched the video. Provide a suggested direction, a practical sequence idea, and one useful gap or caveat when applicable." },
          { role: "user", content: `Question: ${input.question}\n\nSelected footage metadata:\n${JSON.stringify(context)}` },
        ],
      });
      const answer = response.choices[0]?.message.content;
      return { answer: typeof answer === "string" ? answer : "I could not form a suggestion from this selection." };
    }),
  }),
  collections: router({
    list: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return { collections: demoCollections, mode: "sample" as const };
      const rows = await db.listCollectionsForUser(ctx.user.id);
      return rows.length
        ? { collections: rows.map(row => ({ ...row, clipCount: 0 })), mode: "personal" as const }
        : { collections: demoCollections, mode: "sample" as const };
    }),
    suggestions: publicProcedure.query(async ({ ctx }) => ({ collections: buildCollectionSuggestions(await clipsFor(ctx.user?.id)) })),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional(), accent: z.string().trim().max(30).optional() })).mutation(async ({ ctx, input }) => {
      const collection = await db.createCollection({ ...input, userId: ctx.user.id });
      if (!collection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create collection." });
      return collection;
    }),
    addClip: protectedProcedure.input(z.object({ collectionId: z.number().int().positive(), clipId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const success = await db.addClipToCollection({ ...input, userId: ctx.user.id });
      if (!success) throw new TRPCError({ code: "FORBIDDEN", message: "This collection or clip is not available in your workspace." });
      return { success };
    }),
  }),
});

export type AppRouter = typeof appRouter;
