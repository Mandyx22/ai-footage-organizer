import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import {
  buildCollectionSuggestions,
  DEMO_CLIPS,
  rankFootage,
  rankSimilar,
  toFootageClip,
  type ClipMetadataV2,
  type FootageClip,
} from "./footage";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { getFrameAnalysisProvider } from "./_core/frameAnalysisProvider";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";

const metadataV2Schema = z
  .object({
    description: z.string(),
    observed: z
      .object({
        visibleFacts: z.array(z.string()),
        subjects: z.array(z.string()),
        setting: z.string(),
        time: z.string(),
        lighting: z.array(z.string()),
        colors: z.array(z.string()),
        shotType: z.string(),
        cameraMotion: z.string(),
      })
      .strict(),
    interpretation: z
      .object({
        mood: z.array(z.string()),
        sceneInterpretation: z.string(),
        uncertainty: z.array(z.string()),
      })
      .strict(),
    creative: z
      .object({
        editingUses: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

const demoCollections = [
  {
    id: -1,
    name: "Tokyo after dark",
    description: "Neon, rain and shared nights.",
    accent: "violet",
    isAiSuggested: true,
    clipCount: 3,
  },
  {
    id: -2,
    name: "Quiet in-between",
    description: "Soft pauses to slow the edit down.",
    accent: "amber",
    isAiSuggested: true,
    clipCount: 2,
  },
  {
    id: -3,
    name: "Warm daylight",
    description: "Morning movement and golden details.",
    accent: "lime",
    isAiSuggested: false,
    clipCount: 2,
  },
];

const FRAME_ANALYSIS_SYSTEM_PROMPT =
  'You analyze several sampled frames from one video for a personal footage library. The sampled frames are multiple views of one video clip, not separate clips. Return one combined clip-level Metadata V2 analysis. Keep observed visual facts, subjective interpretation, and creative editing suggestions separated. Description must be one concise grounded clip-level sentence, primarily describing visually supported content and not giving editing advice. Observed fields must contain only visual facts or visually supported attributes. Interpretation fields may include subjective mood and a short scene interpretation, but do not present them as direct facts. Uncertainty should contain short natural-language caveats only where useful; use an empty array if none are useful. Creative editingUses should contain editorial suggestions only. Use lower-case concise English tags for arrays. Use "unknown" for cameraMotion or other fields when the frames do not provide enough evidence. Do not overclaim identity, relationships, exact location, emotion, brand names, or events. Return exactly one JSON object that matches the schema. Never return a top-level array.';

const FRAME_ANALYSIS_RESPONSE_SCHEMA = {
  name: "footage_metadata",
  strict: true,
  schema: {
    type: "object",
    properties: {
      description: { type: "string" },
      observed: {
        type: "object",
        properties: {
          visibleFacts: { type: "array", items: { type: "string" } },
          subjects: { type: "array", items: { type: "string" } },
          setting: { type: "string" },
          time: { type: "string" },
          lighting: { type: "array", items: { type: "string" } },
          colors: { type: "array", items: { type: "string" } },
          shotType: { type: "string" },
          cameraMotion: { type: "string" },
        },
        required: [
          "visibleFacts",
          "subjects",
          "setting",
          "time",
          "lighting",
          "colors",
          "shotType",
          "cameraMotion",
        ],
        additionalProperties: false,
      },
      interpretation: {
        type: "object",
        properties: {
          mood: { type: "array", items: { type: "string" } },
          sceneInterpretation: { type: "string" },
          uncertainty: { type: "array", items: { type: "string" } },
        },
        required: ["mood", "sceneInterpretation", "uncertainty"],
        additionalProperties: false,
      },
      creative: {
        type: "object",
        properties: {
          editingUses: { type: "array", items: { type: "string" } },
        },
        required: ["editingUses"],
        additionalProperties: false,
      },
    },
    required: ["description", "observed", "interpretation", "creative"],
    additionalProperties: false,
  },
} as const;

async function collectionsWithCounts(userId: number) {
  const [rows, counts] = await Promise.all([
    db.listCollectionsForUser(userId),
    db.listCollectionClipCountsForUser(userId),
  ]);
  const countByCollection = new Map(
    counts.map(row => [row.collectionId, row.clipCount])
  );
  return rows.map(row => ({
    ...row,
    clipCount: countByCollection.get(row.id) ?? 0,
  }));
}

async function modelId(preferred: string, fallback: string) {
  const { data } = await listLLMModels();
  return (
    data.find(model => model.id === preferred)?.id ??
    data.find(model => model.id === fallback)?.id
  );
}

async function clipsFor(userId?: number | null): Promise<FootageClip[]> {
  if (!userId) return DEMO_CLIPS;
  const saved = await db.listClipsForUser(userId);
  return saved.length ? saved.map(toFootageClip) : DEMO_CLIPS;
}

function parseFrameAnalysisMetadata(raw: string): ClipMetadataV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "AI analysis returned malformed JSON metadata.",
    });
  }

  const candidate = Array.isArray(parsed)
    ? parsed.length === 1 &&
      typeof parsed[0] === "object" &&
      parsed[0] !== null &&
      !Array.isArray(parsed[0])
      ? parsed[0]
      : undefined
    : typeof parsed === "object" && parsed !== null
      ? parsed
      : undefined;

  if (!candidate) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "AI analysis metadata must be exactly one JSON object.",
    });
  }

  return metadataV2Schema.parse(candidate) as ClipMetadataV2;
}

async function analyzeRepresentativeFrame(input: {
  fileName: string;
  previewDataUrls: string[];
}) {
  const raw = await getFrameAnalysisProvider().analyzeFrames({
    fileName: input.fileName,
    previewDataUrls: input.previewDataUrls,
    systemPrompt: FRAME_ANALYSIS_SYSTEM_PROMPT,
    responseSchema: FRAME_ANALYSIS_RESPONSE_SCHEMA,
  });
  if (typeof raw !== "string" || !raw)
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "AI analysis returned no metadata.",
    });
  return parseFrameAnalysisMetadata(raw);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => ({
      user: opts.ctx.user,
      auth: opts.ctx.auth,
    })),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),
  footage: router({
    sampleList: publicProcedure.query(() => ({
      clips: DEMO_CLIPS,
      mode: "sample" as const,
    })),
    sampleSearch: publicProcedure
      .input(z.object({ query: z.string().trim().max(160) }))
      .query(({ input }) => {
        const ranked = rankFootage(DEMO_CLIPS, input.query);
        return {
          clips: ranked.map(item => item.clip),
          scores: Object.fromEntries(
            ranked.map(item => [item.clip.id, item.score])
          ),
          query: input.query,
          mode: "sample" as const,
        };
      }),
    sampleSimilar: publicProcedure
      .input(
        z.object({
          clipId: z.number().int(),
          dimension: z
            .enum([
              "all",
              "color",
              "mood",
              "lighting",
              "subject",
              "composition",
              "motion",
            ])
            .default("all"),
        })
      )
      .query(({ input }) => ({
        clips: rankSimilar(DEMO_CLIPS, input.clipId, input.dimension).map(
          item => item.clip
        ),
        dimension: input.dimension,
        mode: "sample" as const,
      })),
    personalList: protectedProcedure
      .input(
        z
          .object({
            projectId: z.number().int().positive().nullable().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => ({
        clips: (await db.listClipsForUser(ctx.user.id, input?.projectId)).map(
          toFootageClip
        ),
        mode: "personal" as const,
      })),
    personalSearch: protectedProcedure
      .input(
        z.object({
          query: z.string().trim().max(160),
          projectId: z.number().int().positive().nullable().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const source = (
          await db.listClipsForUser(ctx.user.id, input.projectId)
        ).map(toFootageClip);
        const ranked = rankFootage(source, input.query);
        return {
          clips: ranked.map(item => item.clip),
          scores: Object.fromEntries(
            ranked.map(item => [item.clip.id, item.score])
          ),
          query: input.query,
          mode: "personal" as const,
        };
      }),
    personalSimilar: protectedProcedure
      .input(
        z.object({
          clipId: z.number().int(),
          projectId: z.number().int().positive().nullable().optional(),
          dimension: z
            .enum([
              "all",
              "color",
              "mood",
              "lighting",
              "subject",
              "composition",
              "motion",
            ])
            .default("all"),
        })
      )
      .query(async ({ ctx, input }) => {
        const source = (
          await db.listClipsForUser(ctx.user.id, input.projectId)
        ).map(toFootageClip);
        return {
          clips: rankSimilar(source, input.clipId, input.dimension).map(
            item => item.clip
          ),
          dimension: input.dimension,
          mode: "personal" as const,
        };
      }),
    list: publicProcedure.query(async ({ ctx }) => {
      const source = await clipsFor(ctx.user?.id);
      return {
        clips: source,
        mode:
          source === DEMO_CLIPS ? ("sample" as const) : ("personal" as const),
      };
    }),
    search: publicProcedure
      .input(z.object({ query: z.string().trim().max(160) }))
      .query(async ({ ctx, input }) => {
        const source = await clipsFor(ctx.user?.id);
        const ranked = rankFootage(source, input.query);
        return {
          clips: ranked.map(item => item.clip),
          scores: Object.fromEntries(
            ranked.map(item => [item.clip.id, item.score])
          ),
          query: input.query,
        };
      }),
    similar: publicProcedure
      .input(
        z.object({
          clipId: z.number().int(),
          dimension: z
            .enum([
              "all",
              "color",
              "mood",
              "lighting",
              "subject",
              "composition",
              "motion",
            ])
            .default("all"),
        })
      )
      .query(async ({ ctx, input }) => {
        const source = await clipsFor(ctx.user?.id);
        return {
          clips: rankSimilar(source, input.clipId, input.dimension).map(
            item => item.clip
          ),
          dimension: input.dimension,
        };
      }),
    analyzeFrame: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(100),
          sizeBytes: z.number().int().min(0).max(52_428_800),
          durationMs: z.number().int().min(0).max(21_600_000),
          projectId: z.number().int().positive().nullable().optional(),
          previewDataUrl: z.string().startsWith("data:image/").max(8_000_000),
          previewDataUrls: z
            .array(z.string().startsWith("data:image/").max(8_000_000))
            .min(1)
            .max(5)
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          input.projectId !== null &&
          input.projectId !== undefined &&
          !(await db.userOwnsEditingProject({
            userId: ctx.user.id,
            projectId: input.projectId,
          }))
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This editing project is not available in your workspace.",
          });
        const metadata = await analyzeRepresentativeFrame({
          fileName: input.fileName,
          previewDataUrls: input.previewDataUrls?.length
            ? input.previewDataUrls
            : [input.previewDataUrl],
        });
        const match = input.previewDataUrl.match(
          /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
        );
        if (!match)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Preview frame format is not supported.",
          });
        const extension = match[1].includes("png") ? "png" : "jpg";
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const thumbnail = await storagePut(
          `framefind/${ctx.user.id}/thumbnails/${safeName}.${extension}`,
          Buffer.from(match[2], "base64"),
          match[1]
        );
        const clip = await db.createAnalyzedClip({
          ...input,
          userId: ctx.user.id,
          thumbnailKey: thumbnail.key,
          thumbnailUrl: thumbnail.url,
          metadata,
        });
        if (!clip)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create your footage record.",
          });
        return { clip: toFootageClip(clip) };
      }),
    delete: protectedProcedure
      .input(z.object({ clipId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteClipForUser({
          userId: ctx.user.id,
          clipId: input.clipId,
        });
        if (!success)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This uploaded clip is not available in your workspace.",
          });
        return { success };
      }),
    moveToProject: protectedProcedure
      .input(
        z.object({
          clipId: z.number().int().positive(),
          projectId: z.number().int().positive().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const success = await db.moveClipToEditingProject({
          userId: ctx.user.id,
          ...input,
        });
        if (!success)
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "This clip or editing project is not available in your workspace.",
          });
        return { success };
      }),
    ask: publicProcedure
      .input(
        z.object({
          question: z.string().trim().min(3).max(600),
          clipIds: z.array(z.number().int()).min(1).max(30),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const source = await clipsFor(ctx.user?.id);
        const selected = source.filter(clip => input.clipIds.includes(clip.id));
        if (!selected.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Select at least one clip from this workspace first.",
          });
        const selectedModel = await modelId(
          "gpt-5-mini",
          "gemini-3-flash-preview"
        );
        const context = selected.map(clip => ({
          fileName: clip.fileName,
          durationSeconds: Math.round(clip.durationMs / 100) / 10,
          description: clip.description,
          subjects: clip.subjects,
          setting: clip.setting,
          time: clip.time,
          lighting: clip.lighting,
          colors: clip.colors,
          mood: clip.mood,
          shotType: clip.shotType,
          cameraMotion: clip.cameraMotion,
          possibleUses: clip.possibleUses,
        }));
        const response = await invokeLLM({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content:
                "You are Framefind, a thoughtful creative retrieval assistant. Answer only from the supplied footage metadata. Be specific, encouraging, and concise. Do not invent clips or claim you watched the video. Provide a suggested direction, a practical sequence idea, and one useful gap or caveat when applicable.",
            },
            {
              role: "user",
              content: `Question: ${input.question}\n\nSelected footage metadata:\n${JSON.stringify(context)}`,
            },
          ],
        });
        const answer = response.choices[0]?.message.content;
        return {
          answer:
            typeof answer === "string"
              ? answer
              : "I could not form a suggestion from this selection.",
        };
      }),
  }),
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const [projects, allClips] = await Promise.all([
        db.listEditingProjectsForUser(ctx.user.id),
        db.listClipsForUser(ctx.user.id),
      ]);
      return {
        projects: projects.map(project => ({
          ...project,
          clipCount: allClips.filter(clip => clip.projectId === project.id)
            .length,
        })),
        unassignedCount: allClips.filter(clip => clip.projectId === null)
          .length,
      };
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          description: z.string().trim().max(500).optional(),
          accent: z.string().trim().max(30).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const project = await db.createEditingProject({
          userId: ctx.user.id,
          ...input,
        });
        if (!project)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create editing project.",
          });
        return project;
      }),
  }),
  collections: router({
    sampleList: publicProcedure.query(() => ({
      collections: demoCollections,
      mode: "sample" as const,
    })),
    personalList: protectedProcedure.query(async ({ ctx }) => {
      const collections = await collectionsWithCounts(ctx.user.id);
      return { collections, mode: "personal" as const };
    }),
    personalSuggestions: protectedProcedure.query(async ({ ctx }) => ({
      collections: buildCollectionSuggestions(
        (await db.listClipsForUser(ctx.user.id)).map(toFootageClip)
      ),
      mode: "personal" as const,
    })),
    list: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user)
        return { collections: demoCollections, mode: "sample" as const };
      const collections = await collectionsWithCounts(ctx.user.id);
      return collections.length
        ? { collections, mode: "personal" as const }
        : { collections: demoCollections, mode: "sample" as const };
    }),
    suggestions: publicProcedure.query(async ({ ctx }) => ({
      collections: buildCollectionSuggestions(await clipsFor(ctx.user?.id)),
    })),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          description: z.string().trim().max(500).optional(),
          accent: z.string().trim().max(30).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const collection = await db.createCollection({
          ...input,
          userId: ctx.user.id,
        });
        if (!collection)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create collection.",
          });
        return collection;
      }),
    addClip: protectedProcedure
      .input(
        z.object({
          collectionId: z.number().int().positive(),
          clipId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const success = await db.addClipToCollection({
          ...input,
          userId: ctx.user.id,
        });
        if (!success)
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "This collection or clip is not available in your workspace.",
          });
        return { success };
      }),
  }),
});

export type AppRouter = typeof appRouter;
