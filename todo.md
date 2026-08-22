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

## Retrieval and RAG Architecture

Embedding itself is not RAG.

Framefind's future retrieval and generation architecture should keep two layers conceptually separate:

- Retrieval Layer: find relevant clips from the user's existing footage.
- Generation Layer: answer, inspire, or suggest editing direction based on the footage that retrieval selected.

Embedding is a retrieval component. RAG is retrieval plus context construction plus LLM generation.

Canonical future pipeline:

```text
Footage
   ↓
Multi-frame AI Analysis
   ↓
Rich Structured Metadata
   ↓
Canonical Searchable Representation
   ↓
Embeddings
   ↓
Retrieval Layer
   ├── Metadata Search
   ├── Semantic Search
   └── Find Similar
   ↓
Relevant / Selected Clips
   ↓
RAG Context Builder
   ↓
LLM
   ↓
Ask / Inspire / Editing Direction
```

Search itself does not necessarily call an LLM. Find Similar itself does not necessarily call an LLM. Ask / Inspire is the primary future RAG application layer.

Metadata and embeddings are not competing systems:

- Metadata provides explainability, filtering, structured organization, and grounding for Ask / Inspire.
- Embeddings provide fuzzy semantic retrieval, mood / concept similarity, and better recall for subjective queries.

Future search should likely combine both:

```text
Metadata relevance
+
Embedding semantic similarity
↓
Final ranking
```

Embeddings should add semantic recall without discarding structured metadata retrieval.

Future multimodal expansion is not part of the MVP:

```text
Clip
├── text metadata embedding
├── visual/frame embedding
└── transcript embedding
```

Later exploration may include visual embeddings, transcript embeddings, multimodal retrieval, reranking, vector databases, and background embedding workers. Do not introduce vector DB migration, separate image embedding architecture, transcript pipeline, reranking models, queues / background workers, or multimodal fusion in the first semantic retrieval version. The first semantic retrieval version should prioritize rich metadata -> text embedding.

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

Implementation note:

- The no-login MVP uses one persisted prototype user in the existing `users` table as a local / single-user prototype workspace identity. This is not production anonymous-user isolation.

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

### Milestone 4 - Metadata / lexical retrieval baseline

- [ ] Stabilize metadata / lexical retrieval behavior.
- [ ] Search across description, subjects, setting, lighting, colors, mood, shot type, camera motion, and editing uses / possible uses.
- [ ] Use metadata / token / synonym matching during this milestone.
- [ ] Do not introduce embeddings during this milestone.
- [ ] Do not describe keyword / metadata matching as vector semantic search.
- [ ] Improve explainable ranking.
- [ ] Add fixed fixture queries.
- [ ] Return explainable match reasons.

Completion criteria:

- [ ] Metadata search behavior is predictable, tested, and honestly labeled.

### Milestone 5 - Semantic Retrieval with Embeddings

- [ ] Convert rich structured metadata into a canonical searchable text representation.
- [ ] Generate clip embeddings from the canonical searchable text.
- [ ] Generate embeddings from user queries.
- [ ] Use vector similarity to retrieve semantic-nearest clips.
- [ ] Preserve metadata retrieval and combine metadata relevance with embedding semantic similarity.
- [ ] Keep V1 simple: rich metadata -> canonical text -> embedding model -> clip vector.
- [ ] Do not start with complex multimodal vector architecture.
- [ ] Validate subjective semantic queries against clips that do not literally contain the query words.

V1 clip representation example:

```text
Description:
A person sits alone beside a lake at sunset.

Visible facts:
person outdoors, lake, sunset

Setting:
lakeside

Lighting:
warm sunset light

Mood:
quiet, reflective, intimate

Shot:
medium-wide static shot

Editing uses:
memory montage, reflective transition, closing moment
```

V1 embedding flow:

```text
Rich metadata
→ canonical text
→ embedding model
→ clip vector
```

User query flow:

```text
"lonely but warm"
→ embedding model
→ query vector
```

Canonical evaluation case:

User searches:

> 找一些让我感觉有点孤独但又很温暖的镜头

Useful results might include:

- sunset through train window
- friend sitting alone by lake
- empty cafe after dinner
- streetlights through rainy windshield

These should be retrievable even if the clip metadata does not directly contain "孤独" or "温暖". This is the product value semantic retrieval must add beyond keyword search. Evaluation should verify that embedding retrieval is useful, not merely that it can return any result.

Completion criteria:

- [ ] Semantic / feeling-based retrieval works beyond exact metadata keyword overlap.

### Milestone 6 - Find Similar V2

- [ ] Treat Find Similar as a retrieval application.
- [ ] Start from the current baseline of subjects, mood, colors, setting, and related field overlap.
- [ ] Upgrade ranking to combine metadata similarity with embedding similarity.
- [ ] Support content similarity, visual / scene similarity, mood / atmosphere similarity, and potential editing-use similarity.
- [ ] Improve similarity beyond exact field overlap.

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

### Milestone 8 - Ask / Inspire as RAG

- [ ] Treat Ask / Inspire as the main RAG layer.
- [ ] Let users ask about selected or retrieved footage.
- [ ] Let users request inspiration and editing direction.
- [ ] Retrieve relevant clips, rank a bounded set, fetch their rich metadata, build grounded context, and pass that context to the LLM.
- [ ] Base AI answers primarily on generated rich metadata and retrieved clip context.
- [ ] Do not imply the assistant re-watches the complete video for every answer.
- [ ] Show which clips are selected.
- [ ] Make clear which existing information the answer is based on.

Typical RAG pipeline:

```text
User question
↓
Retrieve relevant clips
↓
Select / rank a bounded set
↓
Fetch their rich metadata
↓
Build grounded context
↓
LLM
↓
Answer / Inspiration / Editing Direction
```

Example future request:

> 从我的 footage 里找一些适合做一个安静夏日回忆 montage 的镜头，并告诉我怎么组织。

The future system should use retrieval to find relevant clips, use metadata plus embedding ranking, select a bounded relevant clip set, build context from those clips' real metadata, provide the context plus question to the LLM, and generate grounded editing suggestions. The LLM should not pretend it saw video content that was not provided to it.

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
