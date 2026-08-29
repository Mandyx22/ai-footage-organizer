---
name: framefind-metadata
description: Framefind Metadata V2 invariants — the canonical structured metadata schema, frame-analysis prompt rules, strict response schema, search document and ranking weights, and synonym concepts. Use when touching AI footage analysis, metadata schemas, retrieval/search, Find Similar, collection suggestions, or any code that reads/writes clip metadataJson. Keep observed/interpretation/creative separation intact.
---

# Framefind Metadata V2

This skill is the single source of truth for Framefind's creative metadata
language. It is the product invariant everything else hangs on: the Qwen frame
analysis prompt, strict JSON schema, search document, and similarity ranking.

## Core principle: three honest layers

Metadata V2 separates what the AI **sees**, what it **feels**, and what it
**suggests**. Never blur these layers.

| Layer | Meaning | Example |
| --- | --- | --- |
| `observed` | Visual facts only, or visually supported attributes. | `visibleFacts: ["one person", "lake", "sunset"]`, `environmentType: "outdoor"` |
| `interpretation` | Subjective impressions, clearly tagged. | `mood: ["quiet", "reflective"]`, `uncertainty: [...]` |
| `creative` | Suggested editing uses — assistance, not fact. | `editingUses: ["memory montage", "reflective transition"]` |

The mood / camera-motion / editing-use labels are **searchable creative
impressions**, never objective claims.

## Red lines (do not violate)

- **Legacy columns are display-only.** Flattened clip fields (`subjects`,
  `mood`, `possibleUses`, …) may feed existing UI chips. All search,
  ranking, Find Similar, collection suggestions, and other metadata logic
  must read Metadata V2 via `buildSearchDocument` / `metadataJson` — never
  the legacy fields as the source of truth.
- **Ask must send V2.** The Ask procedure's model context is the
  observed / interpretation / creative object (plus `description`), not
  the legacy flattened snapshot. Keep layers named so the model cannot
  treat mood or `editingUses` as visual fact.
- **`DEMO_CLIPS` must obey the same three layers** as live analysis, even
  though they are labeled sample content. Do not put inferred
  relationships (`friends`, couple, family) in `observed` / `subjects`.
  Prefer cautious `cameraMotion` (`unknown`, `likely static`, `likely
  handheld`, `likely moving`, `likely tracking`). Descriptions stay
  grounded and never give editing advice. Ranking fixtures may keep a
  legacy fallback path for old rows; new or edited demo metadata should
  be V2-shaped.

## Type shape (`server/footage.ts` → `ClipMetadataV2`)

```ts
type ClipMetadataV2 = {
  description: string;               // one concise, specific, grounded clip-level sentence; never editing advice
  observed: {
    visibleFacts: string[];          // factual visual observations only
    subjects: string[];              // what/who is in frame
    actions: string[];               // visually supported activity phrases, e.g. "walking with luggage"
    setting: string;                 // place, e.g. "train interior"
    weather: string[];               // only visibly supported: rainy/foggy/sunny/overcast/snowy; [] if unsupported
    environmentType: EnvironmentType;// indoor | outdoor | semi-outdoor | unknown
    socialContext: SocialContext;    // alone | pair | small group | crowd | no people visible | unknown
    activityLevel: ActivityLevel;    // still | low activity | moderate activity | active | highly active | unknown
    visualDensity: VisualDensity;    // minimal | sparse | balanced | busy | cluttered | unknown
    spatialRelationships: string[];  // spatial/composition only, e.g. "one person isolated in a wide frame"
    time: string;                    // time of day: night / sunset / morning / ...
    lighting: string[];              // e.g. ["neon", "low light"], ["golden hour", "soft"]
    colors: string[];                // e.g. ["blue", "magenta"]
    shotType: string;                // close-up / medium / wide / ...
    cameraMotion: string;            // see caution below
  };
  interpretation: {
    mood: string[];                  // creative impression, e.g. ["dreamy", "energetic"]
    atmosphere: string[];            // e.g. ["intimate", "hazy"]
    sceneInterpretation: string;     // what the scene suggests narratively
    uncertainty: string[];           // what the model is unsure about
  };
  creative: {
    editingUses: string[];           // e.g. ["nightlife montage", "transition", "opening"]
  };
};
```

Enum constants live in `server/footage.ts`:
`ENVIRONMENT_TYPES`, `SOCIAL_CONTEXTS`, `ACTIVITY_LEVELS`, `VISUAL_DENSITIES`.

## Prompt rules to preserve (from `FRAME_ANALYSIS_SYSTEM_PROMPT` in `server/routers.ts`)

The sampled frames are **multiple views of one clip**, so the model returns one
**clip-level** analysis. Keep these guardrails when you touch the prompt:

- `description`: one sentence, specific, grounded, includes visual action when
  supported, and **never gives editing advice**.
- `observed.*`: only visual facts / visually supported attributes.
- `actions`: concise visually supported behavior ("eating at a table"); no
  temporal or narrative assumptions.
- `weather`: empty array when unsupported.
- `socialContext`: only visible people arrangement. **Never infer couple,
  family, friends, or relationships** — `small group`/`crowd` describe
  arrangement, not bond.
- `activityLevel`: separate from actions and camera motion.
- `visualDensity`: frame busyness; separate from socialContext and atmosphere.
- `cameraMotion`: **weak because frames are still images** — prefer cautious
  values: `unknown`, `likely static`, `likely handheld`, `likely moving`,
  `likely tracking`. Avoid precise pan/tilt claims.
- `interpretation.*`: explicitly subjective; list `uncertainty`.
- `creative.editingUses`: suggestions only.

The strict output schema is enforced twice:
- `FRAME_ANALYSIS_RESPONSE_SCHEMA` (OpenAI-style JSON schema sent to Qwen `response_format.json_schema`),
- `metadataV2Schema` (zod `.strict()`, parsed in `server/routers.ts`).
Both must agree, or analysis fails loudly as BAD_GATEWAY.

## Search document and ranking (`server/footage.ts`)

`buildSearchDocument(clip)` normalizes V2 metadata (falling back to legacy
fields and an "unknown"/empty padding). `rankFootage(clips, query)` scores
against these fields (weights are deliberate — change them with tests):

| Field | Label | Weight | maxMatches |
| --- | --- | --- | --- |
| `observed.subjects` | subject | 4 | 2 |
| `observed.visibleFacts` | visible fact | 4 | 2 |
| `observed.setting` | setting | 4 | 1 |
| `interpretation.mood` | mood | 4 | 2 |
| `observed.time` | time | 3 | 1 |
| `observed.lighting` | lighting | 3 | 2 |
| `observed.colors` | color | 3 | 2 |
| `observed.shotType` | shot type | 3 | 1 |
| `observed.cameraMotion` | camera motion | 3 | 1 |
| `creative.editingUses` | editing use | 2 | 2 |
| `interpretation.sceneInterpretation` | scene interpretation | 2 | 1 |
| `description` | description | 1 | 1 |

Matching is **lexical + synonym** (`synonyms` map in `server/footage.ts`), e.g.
`quiet → [calm, reflective, still, intimate, lonely, quiet]`, `blue → [blue,
cobalt, violet, neon, cool, slate]`. Each result exposes explainable
`reasons` (e.g. `mood: dreamy`) and a `score`. Keep results honest: this is
**metadata/keyword matching, never vector semantic search** — do not label it
"semantic" in UI or docs until embeddings (Milestone 5) exist.

`rankSimilar(clips, referenceId, dimension)` compares field-overlap across
dimensions `color | mood | lighting | subject | composition | motion` (or
`all`), excluding the reference clip.

`buildProjectSuggestions` derives thematic groups from metadata patterns.

## Change checklist

When metadata or retrieval changes, update in lockstep and add/refresh tests:

1. `ClipMetadataV2` type (`server/footage.ts`)
2. zod `metadataV2Schema` + `FRAME_ANALYSIS_RESPONSE_SCHEMA` + system prompt (`server/routers.ts`)
3. `buildSearchDocument` + weights/synonyms (`server/footage.ts`)
4. DB `metadataJson` write path (`server/db.ts` `createAnalyzedClip`)
5. Tests: `server/footage.test.ts` (retrieval fixtures), `server/db.metadata.test.ts` (persistence), `server/footage.protected.test.ts`, `server/footage.router.test.ts`
6. Demo clips/DEMO fixtures still obey the red lines above (run tests; `DEMO_CLIPS` exercises ranking)
7. Update docs: `docs/PRD.md`, this skill.

Do not claim semantic retrieval or "understand queries" beyond what rankFootage
actually does. Do not introduce embeddings/vector DB in this milestone without
Milestone 5 planning.

## Milestone 5 direction (do not build yet unless tasked)

Planned V1: rich metadata → canonical text representation → text embedding →
clip vector; queries embedded the same way; combined metadata + embedding
ranking. Canonical evaluation case: a query like "孤独但温暖" must surface clips
whose metadata lacks those exact words. Note the DB is **MySQL**; vector search
design (e.g. ChromaDB/CAS style like SentrySearch, or MySQL VECTOR) is an open
decision to raise during Milestone 5 — do not wire one in early.