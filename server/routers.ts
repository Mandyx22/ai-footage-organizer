import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import {
  ACTIVITY_LEVELS,
  buildProjectSuggestions,
  clipAskPayload,
  DEMO_CLIPS,
  ENVIRONMENT_TYPES,
  rankFootage,
  rankSimilar,
  SOCIAL_CONTEXTS,
  toFootageClip,
  VISUAL_DENSITIES,
  type ClipMetadataV2,
  type FootageClip,
} from "./footage";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { getFrameAnalysisProvider } from "./_core/frameAnalysisProvider";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { systemRouter } from "./_core/systemRouter";

const metadataV2Schema = z
  .object({
    description: z.string(),
    observed: z
      .object({
        visibleFacts: z.array(z.string()),
        subjects: z.array(z.string()),
        actions: z.array(z.string()),
        setting: z.string(),
        weather: z.array(z.string()),
        environmentType: z.enum(ENVIRONMENT_TYPES),
        socialContext: z.enum(SOCIAL_CONTEXTS),
        activityLevel: z.enum(ACTIVITY_LEVELS),
        visualDensity: z.enum(VISUAL_DENSITIES),
        spatialRelationships: z.array(z.string()),
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
        atmosphere: z.array(z.string()),
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

const demoProjects = [
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
  'You analyze several sampled frames from one video for a personal footage library. The sampled frames are multiple views of one video clip, not separate clips. Return one combined clip-level Metadata V2 analysis. Keep observed visual facts, subjective interpretation, and creative editing suggestions separated. Description must be one concise but specific grounded clip-level sentence that includes relevant visual action or context when supported and never gives editing advice. Observed fields must contain only visual facts or visually supported attributes. visibleFacts should be factual visual observations only. actions should be concise visually supported activity or behavior phrases such as "walking with luggage", "standing still", or "eating at a table"; avoid unsupported temporal or narrative assumptions. weather should list only visibly supported weather or environmental conditions such as "rainy", "foggy", "sunny", "overcast", or "snowy"; use an empty array when unsupported. environmentType should classify only the physical environment as indoor, outdoor, semi-outdoor, or unknown. socialContext should describe visible people arrangement only: alone, pair, small group, crowd, no people visible, or unknown; never infer couple, family, friends, or relationships. activityLevel should describe how much visible activity is happening in the scene, separate from actions and camera motion. visualDensity should describe frame busyness or amount of visual content, separate from crowd/socialContext and atmosphere. spatialRelationships should describe visible subject/object arrangement and composition such as "one person isolated in a wide frame", "crowd behind foreground subject", or "large empty space around subject"; keep it spatial, not psychological or narrative. cameraMotion is weak because sampled frames are still images; prefer cautious values such as "unknown", "likely static", "likely handheld", "likely moving", or "likely tracking"; avoid precise pan, tilt, or zoom claims unless strongly supported across frames. mood is subjective emotional or semantic tone, not objective fact. atmosphere is concise sensory or visual ambience such as "warm", "soft", "hazy", "spacious", "dim", "rainy", "chaotic", "intimate", "airy", or "still"; keep it separate from mood. sceneInterpretation should be a concise semantic reading of the scene without inventing backstory. Uncertainty should contain short natural-language caveats only where useful; use an empty array if none are useful. Creative editingUses should contain editorial suggestions only. Use lower-case concise English tags for arrays. Do not infer or describe race, ethnicity, gender identity, exact age, private identity, unsupported relationships, unsupported exact locations, emotional state as objective fact, or fictional backstory. Prefer person / people, visually supported action, spatial facts, and cautious interpretation. Return exactly one JSON object that matches the schema. Never return a top-level array.';

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
          actions: { type: "array", items: { type: "string" } },
          setting: { type: "string" },
          weather: { type: "array", items: { type: "string" } },
          environmentType: { type: "string", enum: [...ENVIRONMENT_TYPES] },
          socialContext: { type: "string", enum: [...SOCIAL_CONTEXTS] },
          activityLevel: { type: "string", enum: [...ACTIVITY_LEVELS] },
          visualDensity: { type: "string", enum: [...VISUAL_DENSITIES] },
          spatialRelationships: { type: "array", items: { type: "string" } },
          time: { type: "string" },
          lighting: { type: "array", items: { type: "string" } },
          colors: { type: "array", items: { type: "string" } },
          shotType: { type: "string" },
          cameraMotion: { type: "string" },
        },
        required: [
          "visibleFacts",
          "subjects",
          "actions",
          "setting",
          "weather",
          "environmentType",
          "socialContext",
          "activityLevel",
          "visualDensity",
          "spatialRelationships",
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
          atmosphere: { type: "array", items: { type: "string" } },
          sceneInterpretation: { type: "string" },
          uncertainty: { type: "array", items: { type: "string" } },
        },
        required: ["mood", "atmosphere", "sceneInterpretation", "uncertainty"],
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

async function personalClipsWithMembership(
  userId: number,
  projectId?: number | null
): Promise<FootageClip[]> {
  const [clips, memberships] = await Promise.all([
    db.listClipsForUser(userId, projectId),
    db.listProjectClipMemberships(userId),
  ]);
  const projectIdsByClip = new Map<number, number[]>();
  for (const membership of memberships) {
    const list = projectIdsByClip.get(membership.clipId) ?? [];
    list.push(membership.projectId);
    projectIdsByClip.set(membership.clipId, list);
  }
  return clips.map(clip =>
    toFootageClip(clip, projectIdsByClip.get(clip.id) ?? [])
  );
}

const DEFAULT_OPENAI_ASK_MODEL = "gpt-4o-mini";

function resolveOpenAiAskModel() {
  return ENV.openAiAskModel.trim() || DEFAULT_OPENAI_ASK_MODEL;
}

async function clipsFor(userId?: number | null): Promise<FootageClip[]> {
  if (!userId) return DEMO_CLIPS;
  const saved = await db.listClipsForUser(userId);
  return saved.length ? saved.map(clip => toFootageClip(clip)) : DEMO_CLIPS;
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
          reasons: Object.fromEntries(
            ranked.map(item => [item.clip.id, item.reasons])
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
        clips: await personalClipsWithMembership(
          ctx.user.id,
          input?.projectId
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
        const source = await personalClipsWithMembership(
          ctx.user.id,
          input.projectId
        );
        const ranked = rankFootage(source, input.query);
        return {
          clips: ranked.map(item => item.clip),
          scores: Object.fromEntries(
            ranked.map(item => [item.clip.id, item.score])
          ),
          reasons: Object.fromEntries(
            ranked.map(item => [item.clip.id, item.reasons])
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
        const source = await personalClipsWithMembership(
          ctx.user.id,
          input.projectId
        );
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
          reasons: Object.fromEntries(
            ranked.map(item => [item.clip.id, item.reasons])
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
    rename: protectedProcedure
      .input(
        z.object({
          clipId: z.number().int().positive(),
          fileName: z.string().trim().min(1).max(255),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const clip = await db.renameClipForUser({
          userId: ctx.user.id,
          clipId: input.clipId,
          fileName: input.fileName,
        });
        if (!clip)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This uploaded clip is not available in your workspace.",
          });
        return { clip: toFootageClip(clip) };
      }),
    addToProject: protectedProcedure
      .input(
        z.object({
          clipId: z.number().int().positive(),
          projectId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const success = await db.addClipToProject({
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
    removeFromProject: protectedProcedure
      .input(
        z.object({
          clipId: z.number().int().positive(),
          projectId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const success = await db.removeClipFromProject({
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
        const selectedModel = resolveOpenAiAskModel();
        const context = selected.map(clipAskPayload);
        const response = await invokeLLM({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content:
                "You are Framefind, a thoughtful creative retrieval assistant. Answer only from the supplied footage metadata. Keep observed visual facts, subjective interpretation, and creative editingUses separate; do not treat mood or editing suggestions as visual fact. Be specific, encouraging, and concise. Do not invent clips or claim you watched the video. Provide a suggested direction, a practical sequence idea, and one useful gap or caveat when applicable.",
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
    sampleList: publicProcedure.query(() => ({
      projects: demoProjects,
      mode: "sample" as const,
    })),
    list: protectedProcedure.query(async ({ ctx }) => {
      const [projects, memberships, allClips] = await Promise.all([
        db.listEditingProjectsForUser(ctx.user.id),
        db.listProjectClipMemberships(ctx.user.id),
        db.listClipsForUser(ctx.user.id),
      ]);
      const countByProject = new Map<number, number>();
      const assignedClipIds = new Set<number>();
      for (const membership of memberships) {
        assignedClipIds.add(membership.clipId);
        countByProject.set(
          membership.projectId,
          (countByProject.get(membership.projectId) ?? 0) + 1
        );
      }
      return {
        projects: projects.map(project => ({
          ...project,
          clipCount: countByProject.get(project.id) ?? 0,
        })),
        unassignedCount: allClips.filter(
          clip => !assignedClipIds.has(clip.id)
        ).length,
      };
    }),
    suggestions: protectedProcedure.query(async ({ ctx }) => ({
      projects: buildProjectSuggestions(
        (await db.listClipsForUser(ctx.user.id)).map(clip =>
          toFootageClip(clip)
        )
      ),
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
});

export type AppRouter = typeof appRouter;
