# Framefind — Agent Guide

Framefind is a **prototype** pre-editing workspace: upload footage, get
structured AI metadata, retrieve clips, group them, then (later) hand off to
an editor. Browser UI is the product. The CLI is **feature-frozen** (bug
fixes only). Keep every change narrow, tested, and honest as defined below.

Roadmap and current milestone live in `todo.md`. Do not treat this file as
the milestone tracker.

## Before coding

1. `git status --short --branch` — do not collide with existing work.
2. Open the skill that matches the touch set (table below). Skills under
   `.opencode/skills/` are **not** auto-loaded; if you skip this step you
   will miss invariants.
3. Read the relevant section of `todo.md`. Do not start Milestone 5
   (embeddings / vector search) or other un-assigned milestones.

| If you touch | Read first |
| --- | --- |
| Any code, tests, commits, or reports | `.opencode/skills/framefind-dev/SKILL.md` |
| Analysis, `metadataJson`, ranking, Find Similar, project suggestions, Ask | `.opencode/skills/framefind-metadata/SKILL.md` |
| Upload, sampling, thumbnails, ffmpeg/ffprobe, `/manus-storage` | `.opencode/skills/framefind-media/SKILL.md` |

Commands (`pnpm check`, `pnpm test`, `pnpm dev`, …), file map, commit
style, and report format: **framefind-dev only** — do not duplicate them
here.

## Honest (checkable)

- **Three layers.** `observed` = visual facts; `interpretation` = subjective
  and must stay tagged; `creative` = editing suggestions, not facts. Do not
  blur them in the schema, prompt, UI, Ask context, or sample copy.
- **Retrieval is lexical + synonym.** Never label current search, similar,
  or ranking as semantic / vector search — not in UI, README, PRD, or
  in-app docs. That claim waits for Milestone 5.
- **Metadata V2 is the source of truth** for `rankFootage`, `rankSimilar`,
  `buildProjectSuggestions`, and Ask clip context. Legacy columns are
  display-only; all search/recommendation/logic must use Metadata V2 (see
  the metadata skill). Keep legacy columns in sync on write
  (`metadataV2ToLegacy`).
- **Sample ≠ user content.** `DEMO_CLIPS` and the Sample Playground must stay
  clearly labeled fictional / read-only. Do not fabricate reviews,
  testimonials, or personal footage.
- **Ask** may use only supplied clip metadata. Never claim the model watched
  the video.
- Web analysis uses **multiple** sampled frames and one clip-level result.
  Do not document it as a single representative frame.

## Non-negotiable

- No queues or background workers. No raw video bytes in the database
  (keys/URLs + metadata only). AI credentials stay server-side; never
  read, print, or commit `.env`.
- Changing metadata shape means lockstep updates: `ClipMetadataV2`,
  `metadataV2Schema`, `FRAME_ANALYSIS_RESPONSE_SCHEMA`, the analysis
  prompt, `buildSearchDocument`, and `createAnalyzedClip` dual-write.
  Details in framefind-metadata.
- CLI: bug fixes only. Do not add CLI features.
- The app is a single-user local workspace. There is no OAuth/login/session
  surface; every request resolves to the persisted prototype user, so app code
  must not assume or reintroduce an auth layer.

## Stop and discuss first

- Core data-model changes; DB / AI / storage provider swaps.
- Introducing queues or embeddings.
- A diff larger than one bounded feature or about ten files.
- Work that conflicts with uncommitted changes.

## Where things live (index only)

- tRPC: `server/routers.ts` (`system`, `footage`, `projects`).
  Frame-analysis prompt + strict schema live here.
- Ranking / V2 types: `server/footage.ts` (tested).
- Persistence: `server/db.ts`, `drizzle/schema.ts`.
- Upload binary: `server/_core/index.ts` `POST /api/footage/upload/:clipId`.
- Pages: `client/src/pages/` — Home, Library (sample), MyLibrary,
  AskFootage, Documentation, ComponentShowcase, NotFound.

Editor handoff (DaVinci / Resolve) is out of scope for current milestones
(see `todo.md`).
