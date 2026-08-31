---
name: framefind-dev
description: Framefind development discipline. Use when implementing, fixing, testing, committing, or reviewing code in this repo. Covers command set, file map, conventions, milestone workflow, report format, and stop-and-discuss rules. Load before making any change so typecheck/tests/commit/report stay consistent.
---

# Framefind Development Discipline

Framefind is a pre-editing workspace for casual creators: upload footage, get AI
structured metadata, retrieve by natural language, organize into editing
projects, and hand off to an editor. It is a **prototype**, not a background
processing pipeline. Keep every change narrow, honest, and tested.

## Commands

| Purpose | Command | Notes |
| --- | --- | --- |
| Install | `pnpm install` | packageManager is `pnpm`. |
| Typecheck | `pnpm check` | runs `tsc --noEmit`. Must pass before commit. |
| Tests | `pnpm test` | runs `vitest run`. 80+ tests across `server`, `cli`, `client/src/lib`, `client/src/components`. |
| Dev server | `pnpm dev` | `NODE_ENV=development tsx watch server/_core/index.ts`; Vite middleware serves the client; auto-picks a free port from 3000. |
| Build | `pnpm build` | `vite build` + esbuild bundle of the server to `dist/`. |
| DB | `pnpm db:push` | `drizzle-kit generate && drizzle-kit migrate`. |
| CLI | `pnpm framefind` | wraps `node cli/framefind.mjs`. |
| Format | `pnpm format` | prettier write. Only format files you touched. |

If `pnpm` is unavailable in a given shell, run the local bins directly:
`./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/vitest run`.

## Repository map (what to touch)

| Path | Responsibility |
| --- | --- |
| `client/src/pages/` | Routes: `Home`, `Library` (sample), `MyLibrary` (private), `AskFootage`, `Documentation`, `ComponentShowcase`, `NotFound`. |
| `client/src/lib/` | Transport (`trpc.ts`, `footage.ts`), strict source view model (`librarySource.ts`), upload outcome (`uploadOutcome.ts`). Pure logic lives here so it is unit-testable. |
| `client/src/contexts/` | `FootageSelectionContext`, `ThemeContext`. |
| `client/src/components/` | UI primitives (see `components/ui/`) and feature components. `UploadFootageDialog`, `VideoClipPreview`, `SketchShell`. |
| `server/_core/index.ts` | Express bootstrap: multipart `/api/footage/upload/:clipId`, tRPC middleware, Vite middleware / static, storage proxy. |
| `server/routers.ts` | tRPC `appRouter`: `footage`, `projects`, `system`. Also the canonical frame-analysis system prompt + response schema. |
| `server/footage.ts` | Metadata V2 types, `DEMO_CLIPS`, `buildSearchDocument`, `rankFootage`, `rankSimilar`, `buildProjectSuggestions`, `toFootageClip`. Pure, heavily tested. |
| `server/db.ts` | Drizzle data access. All personal queries are scoped by `userId`. |
| `server/_core/` | llm, qwenProvider, frameAnalysisProvider, storageProxy, context, env, trpc, etc. |
| `server/storage.ts` | S3-compatible object storage helpers (`storagePut` returns `{ key, url: /manus-storage/... }`). |
| `drizzle/schema.ts` | MySQL tables: `users`, `editingProjects`, `clips`, `projectClips` (membership). |
| `shared/` | Shared client/server types and constants (`const.ts` has error messages). Import via `@shared`. |
| `cli/` | Local-first CLI (`framefind.mjs` + `framefind-core.mjs`). Feature development is frozen; fix bugs only. |
| `todo.md` | Canonical roadmap + milestone state. Update it after each milestone. |
| `docs/` | PRD, CLI guide, QA notes, competitor summary. Update QA_NOTES on visual changes. |

## Conventions (the non-negotiables)

- TypeScript everywhere; `strict` mode. Import aliases: `@/*` → `client/src`, `@shared/*` → `shared`.
- Server procedures are typed through the tRPC `appRouter`; add `.strict()` zod schemas for AI output.
- Video bytes live in object storage. The DB stores only storage keys/URLs plus metadata. Never store raw video in the DB.
- AI model credentials stay server-side only (env), never in browser code or git.
- Metadata JSON array fields (subjects, lighting, colors, moods, possibleUses) persist as JSON strings in `TEXT` columns; `toFootageClip` parses them with `safeArray`.
- Metadata V2 (`metadataJson`) is the source of truth for search; legacy columns exist for display compatibility. Keep them in sync when one metadata path changes (see `metadataV2ToLegacy` and `metadataJsonAsV2` in `server/footage.ts`).
- The product never fabricates reviews/testimonials/user content. Sample content must stay clearly labeled as read-only sample content.
- AI answers must be grounded only in supplied clip metadata, never claim to have watched a video.
- Keep UI in the existing visual language: warm grid-paper background, paper cards, pencil-style outlines, nocturnal/editorial accents.
- Do not add code comments unless they explain a non-obvious decision. Keep code self-documenting.

## The frame-analysis prompt chain (one place to be careful)

The system prompt and strict response schema live in `server/routers.ts`
(`FRAME_ANALYSIS_SYSTEM_PROMPT`, `FRAME_ANALYSIS_RESPONSE_SCHEMA`) and are
validated by `metadataV2Schema` in the same file. The Qwen provider
(`server/_core/qwenProvider.ts`) sends the sampled frames with that prompt.
If you change metadata shape, update **all four** consistently:
1. `ClipMetadataV2` in `server/footage.ts`
2. `metadataV2Schema` + `FRAME_ANALYSIS_RESPONSE_SCHEMA` + prompt in `server/routers.ts`
3. `buildSearchDocument` in `server/footage.ts`
4. DB `metadataJson` persistence expectations (`server/db.ts` `createAnalyzedClip`)
See the `framefind-metadata` skill for the schema invariants before editing any of these.

## Milestone workflow (per todo.md)

For each piece of work: inspect → plan → (approve architecture if necessary) →
implement a bounded change → run → test → review diff → fix → commit → update
todo.md.

Before coding, check: `git status --short --branch`, uncommitted changes,
relevant frontend/backend code, DB schema/migrations if data is involved,
existing tests, required env variables.

**Stop coding and discuss first** if the task requires any of:
- core data model changes (e.g., merging the now-unified Projects model further, deleting auth)
- DB replacement, AI/storage provider replacement
- deleting the auth architecture
- introducing queues/background workers
- a diff larger than one bounded feature or more than ~10 files
- work that conflicts with existing uncommitted changes

## Commit style

- Concise, behavior-focused titles (see `git log` for the tone): e.g.
  `Improve metadata retrieval ranking`, `Normalize Qwen structured output`,
  `Migrate storage to S3-compatible bucket`.
- One bounded change per commit; never bundle an unrelated refactor.
- Never commit secrets or `.env`. Verify with `git status` before `git add`.
- The user requests commits explicitly; do not auto-commit unless asked.

## Report format after implementation

After implementation, report: changed files, what changed, user-visible
behavior, verification commands, test/build result, manual verification steps,
remaining risks, env/migration/credential requirements, todo.md milestone
status.

## Environment variables

Real ingest requires: `DATABASE_URL`, `BUILT_IN_FORGE_API_URL`,
`BUILT_IN_FORGE_API_KEY` (still referenced by legacy code) and, for analysis,
`DASHSCOPE_API_KEY` (Qwen, OpenAI-compatible mode). S3 piece requires
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`. Auth leftovers (`VITE_APP_ID`, `JWT_SECRET`,
`OAUTH_SERVER_URL`, `OWNER_OPEN_ID`) are targeted for deletion; do not rely on
them. `.env` is gitignored; never commit the local `.env`.