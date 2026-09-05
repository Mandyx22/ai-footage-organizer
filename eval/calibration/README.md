# Framefind Solo-MVP Calibration Artifacts

Schema version: `m5-calibration-solo-v1`.

This directory documents the **approved Solo-MVP calibration contract**. Real
calibration artifacts and raw media are **not** stored in Git. Use local or
object-storage placement outside the repository for curated clips and judgment
sessions.

In-memory parsing and A0/A1 evaluation live in `server/evalCalibration.ts`.
Unit tests build clearly labeled **non-quality** scaffolds only; they are not a
benchmark corpus.

## Honesty boundaries

- Metadata V2 `observed` / `interpretation` / `creative` layers stay separated.
- Calibration metrics use **grade ≥ 2** for binary Success@5 / Precision@5 /
  optional pilot-corpus Recall@10 (diagnostic). nDCG still uses full grades
  (grade 1 contributes). Legacy M5A harness metrics remain grade ≥ 1.
- Reports are **A0/A1 lexical only**. Do not claim semantic lift, provider
  superiority, multilingual-ready status, production-ready quality,
  representative/generalized quality, or M5 go/no-go decisions.
- Family anti-degeneracy (≥2 `familyId` values, ≥1 multi-clip family, ≥1 clip
  from another family) only prevents calibration degeneracy. It cannot support
  representative or generalized quality claims.

## Artifact set (one snapshot)

All files share `schemaVersion=m5-calibration-solo-v1` and one `snapshotId`:

| File | Role |
| --- | --- |
| `manifest.json` | 24 curated clips + retrieval units + Metadata V2; requires nonempty `manifestVersion` and `purpose` exactly `calibration-only` |
| `intents.json` | 6 intent sheets (MUST/SHOULD/exclusions) |
| `queries.json` | 10 query instances |
| `presentation.initial.json` | Blind full-clip initial permutations |
| `annotations.initial.json` | 240 exhaustive query×clip labels |
| `repeat-subset.json` | Frozen 60-pair repeat subset + washout provenance |
| `presentation.repeat.json` | Blind repeat permutations |
| `annotations.repeat.json` | 60 repeat labels |
| `self-resolutions.json` | Disagreement-only self resolutions |
| `evaluation-record.json` | Final qrels + single `finalQrelsSha256` |
| `snapshot-index.json` | Flat SHA-256 map of every **other** artifact |

### Hashing contract

- `snapshot-index.json` is a **flat** map: one SHA-256 per other artifact.
  No self-checksum and no nested dependency graph.
- `evaluation-record.json` carries the **only** derived-data hash:
  `finalQrelsSha256`.
- `parseCalibrationBundle` requires **exact** top-level keys equal to the 11
  `CALIBRATION_ARTIFACT_NAMES` (reject missing and extra names).
- In-memory API (`parseCalibrationBundle`):
  - If `rawUtf8ByArtifact[name]` is provided, those exact UTF-8 bytes are
    `JSON.parse`d (malformed JSON rejected), then deep-compared to
    `bundle[name]` (`isDeepStrictEqual`; key insertion order must not create a
    false mismatch). Only after equality is established is the exact UTF-8
    hashed against the flat snapshot-index entry. Evaluation continues on the
    bundle object alone.
  - Otherwise the hash is `SHA-256(UTF-8 of JSON.stringify(parsedArtifact))`.
  Disk loaders should pass exact file bytes for on-disk verification.
  One snapshot-index hash graph and one `finalQrelsSha256` only.

## Immutable counts / structure

- 24 unique curated clips
- 10 unique query instances
- 6 unique intents
- 240 exhaustive unique initial query/clip labels
- 60 repeat labels (exactly six per query)
- **Six independent queried intents**, used exactly once in this structure:
  - Four translation pairs: each pair (`translation-en` + `translation-zh`
    sharing `translationPairId`) maps one-to-one to a distinct intent with
    `translationEquivalent=true`
  - One `natural-zh` singleton → a distinct intent with
    `translationEquivalent=false`
  - One `hard-negative-en` singleton → a distinct intent with
    `translationEquivalent=false` (`missingConstraint` required)
- Collapsing two translation pairs onto one intent, or flipping
  `translationEquivalent`, is rejected
- `searchableMetadataEvidenceLanguage` is English for all queries
  - EN → `same-language`
  - ZH → `cross-lingual`
  Translation pairing is separate from `languageRelation`
- Every query has ≥1 clip with final grade ≥ 2
- Coverage union uses seven dimensions: `factual-observed`, `action`, `scene`,
  `composition-relationship`, `synonym-paraphrase`, `zero-overlap`,
  `missing-constraint`

## Manifest / security

`manifest.json` requires nonempty `manifestVersion` and `purpose` exactly
`calibration-only`.

Each clip requires: immutable `id`, stable queryless `sourceRef`,
`license{id,evidenceRef}`, `provenance`, lowercase 64-hex `rawMediaSha256`,
`familyId`, `corpusCoverageTags`, `retrievalUnit{startMs,endMs,durationMs}`,
`metadataV2Version`, `canonicalTextVersion=semantic-v1`, complete `metadataV2`.

Retrieval unit: `0 <= startMs < endMs` and `durationMs = endMs - startMs`.
Evidence `timestampMs` is relative to the retrieval unit and must lie in
`0..durationMs`.

### Rejected content

The in-memory parser recursively rejects:

- demo/synthetic sources and ids beginning `demo-` / `syn-`
- absolute POSIX/Windows paths
- `file://` refs
- URLs with query/fragment
- signed URL / credential-like values
- exact raw-media-like keys matched **case-insensitively after lowercasing**
  (same normalization for every `FORBIDDEN_RAW_MEDIA_KEYS` entry and every
  encountered object key): `mediaPath`, `filePath`, `localPath`, `mediaUrl`,
  `signedUrl`, `storageKey`, `rawMedia`, `bytes`, `credential`, `token`,
  `secret`, `apiKey`
- credential-like key names matched **case-insensitively after lowercasing**,
  including `password`, `accessToken`, `privateKey`, `clientSecret` (and
  variants such as `Password`, `ACCESSTOKEN`)
- Safe provenance keys remain allowed: `sourceRef`, `evidenceRef`,
  `provenance`, `rawMediaSha256`

Ordinary non-forbidden keys remain allowed.

### Raw media placement (outside Git)

Approved local layout (example):

```text
<approved-local-root>/<snapshotId>/
  media/                 # raw clips — never commit
  artifacts/             # the JSON set above
  license-evidence/
```

Object-storage keys should be queryless, non-signed references recorded only as
`sourceRef` / evidence refs. Do not invent a new storage architecture in-app.

### Pre-commit / scan guidance

Before committing any calibration-related docs or helpers, scan the working tree
for: raw media extensions, `.env`, signed URL query strings, credential-like
keys, absolute paths, and `demo-`/`syn-` ids in calibration artifacts. Do not
stage raw media or secrets.

## Intents / query authoring

Intent sheets require: `intentId`, `title`, `creatorScenario`, `taskBackstory`,
`acceptableAmbiguity`, nonempty MUST/SHOULD/exclusions, `coverageTags`,
`translationEquivalent`, and `missingConstraint` for hard-negative intents.

Queries require opaque non-PII `authorRef`, `authorRole`, `authoredAt`, and a
`blindAuthorshipDeclaration` proving authors were blind to canonical text,
search documents, synonym expansion, system identities, rankings, scores, and
result sets. Do not collect personal data.

Max query `authoredAt` must be `<= manifest.snapshotFrozenAt`.

## Full-clip / blind annotation

Initial/repeat presentations require randomized exact eligible permutations,
`judgingMode=full-clip`, `fullClipPlaybackRequired=true`, and hidden flags for
Metadata V2, canonical text, search documents, synonym expansion, system
identity, rankings, scores, result sets, provenance/license, and prior labels
(repeat also hides initial order/grade).

Annotation records require `fullClipJudged=true`, grade `0..3`, nonempty
`reason`. Grades 2/3 require nonempty evidence `{timestampMs,note}`; grades 0/1
require nonempty `nonfitReason`.

## Repeat / self-resolution

- Freeze `repeat-subset` after initial completion and before repeat
  presentation/start.
- Washout provenance on `repeat-subset.json`:
  - ISO `washoutStartedAt` / `washoutEndedAt`
  - `washoutEndedAt > washoutStartedAt`
  - `washoutIntervalMs === washoutEndedAt - washoutStartedAt` (ms)
  - `washoutStartedAt >=` initial annotation `completedAt`
  - `washoutEndedAt <=` repeat presentation `generatedAt` (hence before repeat
    annotation start)
  - Interval must be strictly `> 0`; **no** universal minimum duration
- Exactly 60 pairs, six/query, subset of initial pairs, with recorded selection
  method/strata covering both languages, every variant kind, all coverage tags,
  hard-negative cases, multi-clip families, and every occurring initial grade.
- `presentation.repeat.json` must contain **exactly** `CALIBRATION_QUERY_COUNT`
  (10) rows and **exactly one unique row for every query** (reject duplicates,
  missing rows, extras).
- Initial and repeat labels remain immutable.
- Every and only repeated pairs whose grades differ get exactly one
  self-resolution preserving exact initial/repeat grades, `finalGrade`,
  nonempty `resolutionReason`, `resolvedAt`.
- Every `SelfResolution.resolvedAt` must lie **inclusively** within
  `self-resolutions.json` `startedAt` / `completedAt`.
- Final qrels: disagreement → `resolution.finalGrade`; else initial grade.
  Verify one `finalQrelsSha256`.
- Intra-annotator consistency compares initial vs repeat **before** resolution:
  exact-grade and binary≥2 only. Never inter-annotator / adjudicated metrics.

## Zero-overlap

- Searchable evidence language is English. Cross-script mismatch alone never
  qualifies.
- Probe text uses `contentTokensForZeroOverlap`: strip semantic-v1 **rendered**
  field labels (`Label:` / bracketed section headers) as standalone labels only
  (never substring damage to content tokens such as `snapshot`), tokenize
  lowercase Latin alphanumeric content, remove the frozen English function-word
  stoplist, require ≥1 probe content token.
- Target comparison uses tokens from **`canonicalEmbeddingContentValues`**
  (shared semantic-v1 primitive in `server/canonicalText.ts`): the same
  formatted nonempty / non-`unknown` content values rendered by
  `buildCanonicalEmbeddingText`, arrays joined `, `, no labels, omitting
  `interpretation.uncertainty`. Genuine content tokens such as `snapshot` are
  preserved.
- Probe relationship (every `zero-overlap` designation):
  - `queryLanguage=en` → `overlapProbeQueryId` must equal `queryId` (self)
  - `queryLanguage=zh` → query must be `translation-zh` with nonnull
    `translationPairId`; probe must be the unique `translation-en` query with
    identical `intentId` and `translationPairId`
  - Unpaired / natural ZH zero-overlap remains rejected absent separate
    approval. General reference/language validation still applies.
- Checker `zero-overlap-v1` records checker version, excluded labels, stoplist,
  A0/A1 matched target ids (synonym expansion diagnostic only), `checkedAt`.
  No nested evidence hash.
- `runCalibrationLexicalEval` **rejects** (throws) when a declared zero-overlap
  check returns `passed=false`.

## Lifecycle order

Validate cross-file `snapshotId` / `schemaVersion` and:

1. max `authoredAt` ≤ `snapshotFrozenAt` ≤ initial presentation `generatedAt`
2. initial presentation ≤ initial annotation start ≤ completion
3. initial completion ≤ washout start; washout end ≤ repeat presentation;
   initial completion ≤ repeat subset `frozenAt`
4. subset freeze ≤ repeat presentation < repeat start
5. repeat start ≤ repeat annotation start ≤ completion
6. repeat completion ≤ resolution start ≤ completion
7. resolution completion ≤ evaluation `generatedAt` ≤ snapshot-index `generatedAt`

## API / invocation

```ts
import {
  parseCalibrationBundle,
  runCalibrationLexicalEval,
} from "../server/evalCalibration";

const snapshot = parseCalibrationBundle(bundle, {
  // optional exact UTF-8 bytes for on-disk hash verification
  rawUtf8ByArtifact,
});

const report = runCalibrationLexicalEval(snapshot, {
  includePilotCorpusRecallAt10Diagnostic: true,
  qualitativeNotesByQuery, // required nonempty notes for each ranking.slice(0,5) hit
});
```

Report contents (A0/A1 only):

- Per-query: Success@5, Precision@5, nDCG@10, optional pilot-corpus Recall@10
  (diagnostic). **No Recall@5.**
- Six per-intent rows with unrounded means for A0/A1 Success@5 and Precision@5
  plus A1−A0 deltas; when diagnostic Recall@10 is enabled, also unrounded A0/A1
  Recall@10 means and delta (those fields omitted otherwise).
- W/T/L remains exclusively from unrounded mean nDCG@10 (paired EN/ZH mean;
  singleton one query).
- Exact-grade and binary≥2 intra-annotator consistency.
- Qualitative notes required for every actual top-5 hit (no placeholders for
  nonexistent ranks).
- Failed zero-overlap designations throw.

## Hard scope exclusions

Do **not** from this calibration path:

- Call OpenAI, Qwen, or any paid embedding/provider API
- Invoke or modify B0/C0/C1, embedding adapters, vector storage, DB, routers,
  UI, storage architecture, production search, or Find Similar
- Fabricate a real 24-clip corpus into Git
- Store raw media in Git
- Claim M5 go/no-go from Solo-MVP calibration alone
