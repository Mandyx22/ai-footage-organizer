# Framefind MVP Roadmap

This file is the canonical project roadmap for the inherited Manus prototype.

## Confirmed MVP architecture

- [x] Keep React + Vite frontend.
- [x] Keep Express backend.
- [x] Keep tRPC as the main business API.
- [x] Keep multipart HTTP endpoint for video binary upload.
- [x] Keep Drizzle ORM.
- [x] Keep current MySQL database.
- [x] Keep object storage for videos and thumbnails.
- [x] Keep browser-side multi-frame sampling.
- [x] Keep current AI metadata pipeline.
- [x] Do not require authentication for the product MVP workflow.
- [x] Support a no-login / default workspace prototype mode.
- [x] Do not delete the auth system while removing it from the core MVP path.
- [x] Freeze CLI feature development for now.

## Product direction

Framefind helps creators understand, retrieve, organize, discover related footage, and get inspiration from their existing material.

Framefind is not an AI editor that automatically generates final videos.

Semantic retrieval is a later milestone. The product should eventually handle queries like "lonely but warm" by finding semantically related clips even when those exact words are not present in metadata. Embeddings and vector similarity are not part of Milestone 0.

## Milestones

### Milestone 0 - Stabilize inherited Manus project

- [x] Check and resolve Drizzle schema / migration `status` vs `clipStatus` drift.
- [x] Check current branch and uncommitted changes before implementation.
- [x] Document current local run env / credential requirements.
- [x] Confirm build / typecheck / tests.
- [x] Avoid new product features.

Completion criteria:

- [x] Schema and migrations have no known mismatch.
- [x] `pnpm check` passes.
- [x] `pnpm test` passes.
- [x] Project baseline is clearly recorded.
- [x] No unrelated cleanup refactor.

Baseline notes:

- Current stabilization branch: `improve-multiframe-analysis`.
- Existing uncommitted product work before Milestone 0: browser multi-frame sampling and AI prompt updates.
- Required for real web ingest: `DATABASE_URL`, `BUILT_IN_FORGE_API_URL`, and `BUILT_IN_FORGE_API_KEY`.
- Still required by the existing auth system until Milestone 1 removes auth from the core MVP path: `VITE_APP_ID`, `JWT_SECRET`, `OAUTH_SERVER_URL`, and optionally `OWNER_OPEN_ID`.
- Manus / Forge dependencies remain in place. Provider replacement is explicitly out of scope for Milestone 0.

### Milestone 1 - No-login prototype workspace

- [ ] Add the smallest default/local workspace strategy.
- [ ] Keep the existing auth architecture in place.
- [ ] Make upload / analyze / save / library usable without Manus OAuth login.
- [ ] Keep the change scoped.

Completion criteria:

- [ ] In a new browser session, a user can enter My Library without login and begin uploading footage.

### Milestone 2 - One real video end-to-end

- [ ] Select a real video.
- [ ] Run browser multi-frame sampling.
- [ ] Run AI metadata analysis.
- [ ] Create DB clip record.
- [ ] Store thumbnail.
- [ ] Store original video in object storage.
- [ ] Mark clip status `ready`.
- [ ] Show clip in My Library.
- [ ] Play the uploaded video in preview.

Completion criteria:

- [ ] A real video can be manually uploaded, analyzed, saved, displayed in My Library with metadata, and played back.

### Milestone 3 - Metadata V2

- [ ] Define structured clip metadata.
- [ ] Distinguish AI-observed facts from AI-inferred fields and AI-suggested editing uses.
- [ ] Include `visibleFacts`, `description`, `subjects`, `setting`, `time`, `lighting`, `mood`, `shotType`, `cameraMotion`, `editingUses`, and `uncertainty`.
- [ ] Decide metadata persistence schema during this milestone.

Completion criteria:

- [ ] The metadata model clearly separates observed, inferred, and suggested information.

### Milestone 4 - Search baseline

- [ ] Stabilize existing metadata / natural-language retrieval.
- [ ] Do not describe keyword / metadata matching as vector semantic search.
- [ ] Improve ranking.
- [ ] Add fixed fixture queries.
- [ ] Return explainable match reasons.

Completion criteria:

- [ ] Metadata search behavior is predictable, tested, and honestly labeled.

### Milestone 5 - Semantic Search with Embeddings

- [ ] Generate embeddings from rich clip metadata.
- [ ] Generate embeddings from user queries.
- [ ] Use vector similarity to retrieve semantically related clips.
- [ ] Combine metadata matching with embedding similarity.
- [ ] Validate queries such as "lonely but warm" against clips that do not literally contain those words.

Completion criteria:

- [ ] Semantic / feeling-based retrieval works beyond exact metadata keyword overlap.

### Milestone 6 - Find Similar V2

- [ ] Combine metadata similarity with embedding similarity.
- [ ] Improve similarity beyond exact field overlap.
- [ ] Support theme, visual, and mood similarity.

Completion criteria:

- [ ] Find Similar returns footage that is meaningfully related, not only clips with identical metadata fields.

### Milestone 7 - Collections

- [ ] Create collections.
- [ ] Add clips.
- [ ] Open collection.
- [ ] Browse collection clips.
- [ ] Remove clips.
- [ ] Preserve collection state after refresh.

Completion criteria:

- [ ] The collection workflow is complete and persistent.

### Milestone 8 - Ask / Inspire

- [ ] Let users ask about selected footage.
- [ ] Let users request inspiration and editing direction.
- [ ] Base AI answers primarily on generated rich metadata.
- [ ] Do not imply the assistant re-watches the complete video for every answer.
- [ ] Show which clips are selected.
- [ ] Make clear which existing information the answer is based on.

Completion criteria:

- [ ] Ask / Inspire is grounded in selected footage metadata and communicates its evidence clearly.

## Development workflow

Every milestone follows this sequence:

- [ ] Inspect.
- [ ] Plan.
- [ ] Approve architecture if necessary.
- [ ] Implement bounded change.
- [ ] Run.
- [ ] Test.
- [ ] Review diff.
- [ ] Fix.
- [ ] Commit.
- [ ] Update this TODO.
- [ ] Move to next milestone.

Before coding, check:

- [ ] `git status --short --branch`.
- [ ] Current uncommitted changes.
- [ ] Relevant frontend code.
- [ ] Relevant API / backend code.
- [ ] DB schema / migrations when data is involved.
- [ ] Existing tests.
- [ ] Required environment variables.

After implementation, report:

- [ ] Changed files.
- [ ] What changed.
- [ ] User-visible behavior.
- [ ] Verification commands.
- [ ] Test / build result.
- [ ] Manual verification steps.
- [ ] Remaining risks.
- [ ] Env / migration / credential requirements.
- [ ] TODO milestone status.

Stop coding and discuss first if a task requires:

- [ ] Core data model changes.
- [ ] Database replacement.
- [ ] AI / storage provider replacement.
- [ ] Auth architecture deletion.
- [ ] Queue or background worker introduction.
- [ ] A diff much larger than one bounded feature.
- [ ] Changes to more than about 10 files.
- [ ] Work that conflicts with existing uncommitted changes.

## Manus / Forge dependency strategy

- [ ] Do not directly replace Manus / Forge yet.
- [ ] Identify clear abstraction boundaries first.
- [ ] Keep application logic separate from AI provider implementation.
- [ ] Keep application logic separate from storage provider implementation.
- [ ] Avoid large provider migrations until the core footage workflow is stable.
