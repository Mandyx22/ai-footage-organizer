import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  CANONICAL_TEXT_VERSION,
  canonicalEmbeddingContentValues,
} from "./canonicalText";
import { parseMetadataV2, type RelevanceGrade } from "./evalGold";
import { rankFootageA1 } from "./evalLexical";
import {
  calibrationMetricsForRanking,
  type CalibrationMetricSet,
} from "./evalMetrics";
import {
  metadataV2ToLegacy,
  rankFootage,
  type ClipMetadataV2,
  type FootageClip,
} from "./footage";

export const CALIBRATION_SCHEMA_VERSION = "m5-calibration-solo-v1" as const;
export const ZERO_OVERLAP_CHECKER_VERSION = "zero-overlap-v1" as const;

export const CALIBRATION_CLIP_COUNT = 24;
export const CALIBRATION_QUERY_COUNT = 10;
export const CALIBRATION_INTENT_COUNT = 6;
export const CALIBRATION_INITIAL_LABEL_COUNT = 240;
export const CALIBRATION_REPEAT_LABEL_COUNT = 60;
export const CALIBRATION_REPEAT_PER_QUERY = 6;

export const COVERAGE_TAG_DIMENSIONS = [
  "factual-observed",
  "action",
  "scene",
  "composition-relationship",
  "synonym-paraphrase",
  "zero-overlap",
  "missing-constraint",
] as const;

export const CALIBRATION_ARTIFACT_NAMES = [
  "manifest.json",
  "intents.json",
  "queries.json",
  "presentation.initial.json",
  "annotations.initial.json",
  "repeat-subset.json",
  "presentation.repeat.json",
  "annotations.repeat.json",
  "self-resolutions.json",
  "evaluation-record.json",
  "snapshot-index.json",
] as const;

export const FORBIDDEN_RAW_MEDIA_KEYS = [
  "mediaPath",
  "filePath",
  "localPath",
  "mediaUrl",
  "signedUrl",
  "storageKey",
  "rawMedia",
  "bytes",
  "credential",
  "token",
  "secret",
  "apiKey",
] as const;

export const SEMANTIC_V1_FIXED_LABELS = [
  "OBSERVED",
  "INTERPRETATION",
  "CREATIVE",
  "subjective",
  "suggested use",
  "Description",
  "Visible facts",
  "Subjects",
  "Actions",
  "Setting",
  "Weather",
  "Environment",
  "Social context",
  "Activity",
  "Visual density",
  "Composition",
  "Time",
  "Lighting",
  "Colors",
  "Shot",
  "Camera motion",
  "Mood",
  "Atmosphere",
  "Scene interpretation",
  "Editing uses",
] as const;

export const ZERO_OVERLAP_STOPLIST = [
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "not",
  "no",
  "do",
  "does",
  "did",
  "so",
  "than",
  "too",
  "very",
] as const;

export const ANTI_DEGENERACY_NOTE =
  "Family anti-degeneracy only prevents Solo-MVP calibration degeneracy; it cannot support representative or generalized quality claims.";

export const CALIBRATION_REPORT_DISCLAIMER =
  "Solo-MVP calibration is not semantic lift, not provider-superiority evidence, not multilingual-ready, not production-ready, and not an M5 go/no-go decision. Intra-annotator consistency is descriptive only.";

export type CoverageTag = (typeof COVERAGE_TAG_DIMENSIONS)[number];
export type CalibrationArtifactName = (typeof CALIBRATION_ARTIFACT_NAMES)[number];
export type QueryLanguage = "en" | "zh";
export type LanguageRelation = "same-language" | "cross-lingual";
export type QueryVariantKind =
  | "translation-en"
  | "translation-zh"
  | "natural-zh"
  | "hard-negative-en";

const AUTHOR_BLIND_FLAGS = [
  "blindToCanonicalText",
  "blindToSearchDocuments",
  "blindToSynonymExpansion",
  "blindToSystemIdentities",
  "blindToRankings",
  "blindToScores",
  "blindToResultSets",
] as const;

const HIDDEN_FLAGS = [
  "hideMetadataV2",
  "hideCanonicalText",
  "hideSearchDocuments",
  "hideSynonymExpansion",
  "hideSystemIdentity",
  "hideRankings",
  "hideScores",
  "hideResultSets",
  "hideProvenanceAndLicense",
  "hidePriorLabels",
] as const;

const VARIANT_KINDS: QueryVariantKind[] = [
  "translation-en",
  "translation-zh",
  "natural-zh",
  "hard-negative-en",
];

const REPEAT_STRATA = [
  "language",
  "variantKind",
  "coverageTags",
  "grade",
  "family",
] as const;

/** Case-insensitive forbidden raw-media key membership (lowercased once). */
const FORBIDDEN_KEY_NORMALIZED: Set<string> = new Set(
  FORBIDDEN_RAW_MEDIA_KEYS.map(key => key.toLowerCase())
);
/** Case-insensitive credential-like key names (compared after lowercasing). */
const CREDENTIAL_LIKE_KEY_NORMALIZED: Set<string> = new Set([
  "password",
  "accesstoken",
  "privatekey",
  "clientsecret",
]);
const STOPLIST_SET: Set<string> = new Set(ZERO_OVERLAP_STOPLIST);
const COVERAGE_SET: Set<string> = new Set(COVERAGE_TAG_DIMENSIONS);

export type AuthorBlindnessDeclaration = {
  blindToCanonicalText: true;
  blindToSearchDocuments: true;
  blindToSynonymExpansion: true;
  blindToSystemIdentities: true;
  blindToRankings: true;
  blindToScores: true;
  blindToResultSets: true;
};

export type PresentationHiddenFlags = {
  hideMetadataV2: true;
  hideCanonicalText: true;
  hideSearchDocuments: true;
  hideSynonymExpansion: true;
  hideSystemIdentity: true;
  hideRankings: true;
  hideScores: true;
  hideResultSets: true;
  hideProvenanceAndLicense: true;
  hidePriorLabels: true;
  hideInitialOrderAndGrade?: true;
};

export type CalibrationClip = {
  id: string;
  sourceRef: string;
  license: { id: string; evidenceRef: string };
  provenance: string;
  rawMediaSha256: string;
  familyId: string;
  corpusCoverageTags: string[];
  retrievalUnit: { startMs: number; endMs: number; durationMs: number };
  metadataV2Version: string;
  canonicalTextVersion: typeof CANONICAL_TEXT_VERSION;
  metadataV2: ClipMetadataV2;
};

export type CalibrationIntent = {
  intentId: string;
  title: string;
  creatorScenario: string;
  taskBackstory: string;
  acceptableAmbiguity: string;
  must: string[];
  should: string[];
  exclusions: string[];
  coverageTags: CoverageTag[];
  translationEquivalent: boolean;
  missingConstraint: string | null;
};

export type CalibrationQuery = {
  queryId: string;
  intentId: string;
  text: string;
  queryLanguage: QueryLanguage;
  searchableMetadataEvidenceLanguage: "en";
  languageRelation: LanguageRelation;
  variantKind: QueryVariantKind;
  translationPairId: string | null;
  coverageTags: CoverageTag[];
  authorRef: string;
  authorRole: string;
  authoredAt: string;
  blindAuthorshipDeclaration: AuthorBlindnessDeclaration;
  overlapProbeQueryId: string | null;
};

export type CalibrationEvidence = { timestampMs: number; note: string };

export type CalibrationAnnotation = {
  queryId: string;
  clipId: string;
  fullClipJudged: true;
  grade: RelevanceGrade;
  reason: string;
  evidence: CalibrationEvidence[];
  nonfitReason: string | null;
};

export type RepeatPair = { queryId: string; clipId: string };

export type SelfResolution = {
  queryId: string;
  clipId: string;
  initialGrade: RelevanceGrade;
  repeatGrade: RelevanceGrade;
  finalGrade: RelevanceGrade;
  resolutionReason: string;
  resolvedAt: string;
};

export type FinalQrel = {
  queryId: string;
  clipId: string;
  grade: RelevanceGrade;
};

export type CalibrationManifestFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  manifestVersion: string;
  purpose: "calibration-only";
  snapshotFrozenAt: string;
  clips: CalibrationClip[];
};

export type CalibrationIntentsFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  intents: CalibrationIntent[];
};

export type CalibrationQueriesFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  queries: CalibrationQuery[];
};

export type CalibrationPresentationFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  generatedAt: string;
  judgingMode: "full-clip";
  fullClipPlaybackRequired: true;
  randomizationMethod: string;
  randomizationVersion: string;
  hidden: PresentationHiddenFlags;
  presentations: Array<{ queryId: string; clipOrder: string[] }>;
};

export type CalibrationAnnotationsFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  startedAt: string;
  completedAt: string;
  annotations: CalibrationAnnotation[];
};

export type CalibrationRepeatSubsetFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  frozenAt: string;
  washoutStartedAt: string;
  washoutEndedAt: string;
  washoutIntervalMs: number;
  selectionMethod: string;
  strata: string[];
  pairs: RepeatPair[];
};

export type CalibrationSelfResolutionsFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  startedAt: string;
  completedAt: string;
  resolutions: SelfResolution[];
};

export type CalibrationEvaluationRecordFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  generatedAt: string;
  finalQrels: FinalQrel[];
  finalQrelsSha256: string;
};

export type CalibrationSnapshotIndexFile = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  generatedAt: string;
  sha256ByArtifact: Record<string, string>;
};

export type CalibrationArtifactBundle = {
  "manifest.json": CalibrationManifestFile;
  "intents.json": CalibrationIntentsFile;
  "queries.json": CalibrationQueriesFile;
  "presentation.initial.json": CalibrationPresentationFile;
  "annotations.initial.json": CalibrationAnnotationsFile;
  "repeat-subset.json": CalibrationRepeatSubsetFile;
  "presentation.repeat.json": CalibrationPresentationFile;
  "annotations.repeat.json": CalibrationAnnotationsFile;
  "self-resolutions.json": CalibrationSelfResolutionsFile;
  "evaluation-record.json": CalibrationEvaluationRecordFile;
  "snapshot-index.json": CalibrationSnapshotIndexFile;
};

export type CalibrationSnapshot = {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  snapshotId: string;
  manifest: CalibrationManifestFile;
  intents: CalibrationIntentsFile;
  queries: CalibrationQueriesFile;
  presentationInitial: CalibrationPresentationFile;
  annotationsInitial: CalibrationAnnotationsFile;
  repeatSubset: CalibrationRepeatSubsetFile;
  presentationRepeat: CalibrationPresentationFile;
  annotationsRepeat: CalibrationAnnotationsFile;
  selfResolutions: CalibrationSelfResolutionsFile;
  evaluationRecord: CalibrationEvaluationRecordFile;
  snapshotIndex: CalibrationSnapshotIndexFile;
};

export type QualitativeHitNote = {
  clipId: string;
  rank: number;
  note: string;
};

export type ZeroOverlapCheckResult = {
  passed: boolean;
  checkerVersion: typeof ZERO_OVERLAP_CHECKER_VERSION;
  queryId: string;
  overlapProbeQueryId: string;
  a0MatchedTargetIds: string[];
  a1MatchedTargetIds: string[];
  excludedLabels: string[];
  stoplist: string[];
  checkedAt: string;
};

export type CalibrationRankedHit = {
  clipId: string;
  score: number;
  reasons: string[];
};

export type CalibrationLexicalEvalReport = {
  systems: ["A0", "A1"];
  disclaimer: string;
  antiDegeneracyNote: string;
  queries: Array<{
    queryId: string;
    A0: {
      ranking: CalibrationRankedHit[];
      metrics: CalibrationMetricSet;
      top5Notes: QualitativeHitNote[];
    };
    A1: {
      ranking: CalibrationRankedHit[];
      metrics: CalibrationMetricSet;
      top5Notes: QualitativeHitNote[];
    };
  }>;
  byIntentNdcg: Array<{
    intentId: string;
    meanNdcgAt10A0: number;
    meanNdcgAt10A1: number;
    meanSuccessAt5A0: number;
    meanSuccessAt5A1: number;
    successAt5A1MinusA0: number;
    meanPrecisionAt5A0: number;
    meanPrecisionAt5A1: number;
    precisionAt5A1MinusA0: number;
    meanPilotCorpusRecallAt10A0?: number;
    meanPilotCorpusRecallAt10A1?: number;
    pilotCorpusRecallAt10A1MinusA0?: number;
    a1VsA0: "W" | "T" | "L";
  }>;
  intraAnnotatorConsistency: {
    comparedPairs: number;
    exactGrade: number;
    binaryAtLeast2: number;
  };
  zeroOverlapChecks: ZeroOverlapCheckResult[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`
  );
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  assert(typeof value === "string", `${path} must be a string`);
  return value;
}

function asNonempty(value: unknown, path: string): string {
  const text = asString(value, path);
  assert(text.trim().length > 0, `${path} must be nonempty`);
  return text;
}

function asNumber(value: unknown, path: string): number {
  assert(typeof value === "number" && Number.isFinite(value), `${path} must be a finite number`);
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  assert(typeof value === "boolean", `${path} must be a boolean`);
  return value;
}

function asArray(value: unknown, path: string): unknown[] {
  assert(Array.isArray(value), `${path} must be an array`);
  return value;
}

function asStringArray(value: unknown, path: string): string[] {
  const items = asArray(value, path);
  const result: string[] = [];
  for (let i = 0; i < items.length; i++) {
    result.push(asString(items[i], `${path}[${i}]`));
  }
  return result;
}

function asIso(value: unknown, path: string): string {
  const text = asString(value, path);
  assert(
    /^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(Date.parse(text)),
    `${path} must be an ISO timestamp`
  );
  return text;
}

function asGrade(value: unknown, path: string): RelevanceGrade {
  assert(
    value === 0 || value === 1 || value === 2 || value === 3,
    `${path} must be 0 | 1 | 2 | 3`
  );
  return value;
}

function asCoverageTags(value: unknown, path: string): CoverageTag[] {
  const tags = asStringArray(value, path);
  const result: CoverageTag[] = [];
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]!;
    assert(COVERAGE_SET.has(tag), `${path}[${i}] is not a coverage dimension`);
    result.push(tag as CoverageTag);
  }
  return result;
}

function pairKey(queryId: string, clipId: string): string {
  return `${queryId}::${clipId}`;
}

function sha256Utf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256CanonicalJson(value: unknown): string {
  return sha256Utf8(JSON.stringify(value));
}

export function finalQrelsSha256(finalQrels: FinalQrel[]): string {
  return sha256CanonicalJson(finalQrels);
}

function uniqueStrings(values: string[]): string[] {
  const seen: Set<string> = new Set();
  const result: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function rejectForbiddenString(value: string) {
  if (/^(demo-|syn-)/i.test(value) || /(^|\/)(demo-|syn-)/i.test(value)) {
    throw new Error("ids must not begin with demo-/syn-");
  }
  if (value.startsWith("file://")) {
    throw new Error("file:// refs are forbidden");
  }
  if (
    (/^\//.test(value) && !value.startsWith("//")) ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  ) {
    throw new Error("absolute path is forbidden");
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && /[?#]/.test(value)) {
    throw new Error("url query/fragment/signed refs are forbidden");
  }
}

export function assertNoForbiddenPayload(value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    rejectForbiddenString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoForbiddenPayload(value[i]);
    }
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const normalized = key.toLowerCase();
      if (FORBIDDEN_KEY_NORMALIZED.has(normalized)) {
        throw new Error(`forbidden key ${key}`);
      }
      if (CREDENTIAL_LIKE_KEY_NORMALIZED.has(normalized)) {
        throw new Error(`forbidden key ${key} (credential-like)`);
      }
      assertNoForbiddenPayload(record[key]);
    }
  }
}

/** Strip semantic-v1 rendered field labels (`Label:`) only — never substrings of content. */
function stripFixedLabels(text: string): string {
  let remaining = text.replace(/\[[^\]]*\]/g, " ");
  const labels = SEMANTIC_V1_FIXED_LABELS.slice().sort(
    (left, right) => right.length - left.length
  );
  for (let i = 0; i < labels.length; i++) {
    const escaped = labels[i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    remaining = remaining.replace(new RegExp(`${escaped}\\s*:`, "gi"), " ");
  }
  return remaining;
}

function latinContentTokens(text: string): string[] {
  const stripped = stripFixedLabels(text);
  const raw = stripped.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const kept: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const token = raw[i]!;
    if (STOPLIST_SET.has(token)) continue;
    kept.push(token);
  }
  return uniqueStrings(kept);
}

function metadataV2LeafContentTokens(metadata: ClipMetadataV2): string[] {
  const values = canonicalEmbeddingContentValues(metadata);
  const raw = values.join(" ").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const kept: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const token = raw[i]!;
    if (STOPLIST_SET.has(token)) continue;
    kept.push(token);
  }
  return uniqueStrings(kept);
}

export function contentTokensForZeroOverlap(text: string): string[] {
  const tokens = latinContentTokens(text);
  if (tokens.length > 0) return tokens;
  if (!/[a-z0-9]/i.test(text)) {
    throw new Error(
      "zero-overlap requires latin content tokens; cross-script mismatch is not sufficient"
    );
  }
  throw new Error("stoplist-only text has no content token");
}

export function checkZeroOverlapV1(args: {
  probeQueryText: string;
  targetClips: CalibrationClip[];
  queryId: string;
  overlapProbeQueryId: string;
  a0MatchedTargetIds: string[];
  a1MatchedTargetIds: string[];
  checkedAt: string;
}): ZeroOverlapCheckResult {
  const probeTokens = contentTokensForZeroOverlap(args.probeQueryText);
  const probeSet: Set<string> = new Set(probeTokens);
  let passed = true;
  for (let i = 0; i < args.targetClips.length; i++) {
    const clipTokens = metadataV2LeafContentTokens(
      args.targetClips[i]!.metadataV2
    );
    for (let j = 0; j < clipTokens.length; j++) {
      if (probeSet.has(clipTokens[j]!)) {
        passed = false;
        break;
      }
    }
    if (!passed) break;
  }
  return {
    passed,
    checkerVersion: ZERO_OVERLAP_CHECKER_VERSION,
    queryId: args.queryId,
    overlapProbeQueryId: args.overlapProbeQueryId,
    a0MatchedTargetIds: args.a0MatchedTargetIds,
    a1MatchedTargetIds: args.a1MatchedTargetIds,
    excludedLabels: SEMANTIC_V1_FIXED_LABELS.slice(),
    stoplist: ZERO_OVERLAP_STOPLIST.slice(),
    checkedAt: args.checkedAt,
  };
}

function annotationMap(
  annotations: CalibrationAnnotation[]
): Map<string, CalibrationAnnotation> {
  const byPair: Map<string, CalibrationAnnotation> = new Map();
  for (let i = 0; i < annotations.length; i++) {
    const item = annotations[i]!;
    const key = pairKey(item.queryId, item.clipId);
    assert(!byPair.has(key), `duplicate annotation ${key}`);
    byPair.set(key, item);
  }
  return byPair;
}

export function deriveFinalQrels(
  annotationsInitial: CalibrationAnnotationsFile,
  selfResolutions: CalibrationSelfResolutionsFile
): FinalQrel[] {
  const resolutionByPair: Map<string, SelfResolution> = new Map();
  const resolutions = selfResolutions.resolutions;
  for (let i = 0; i < resolutions.length; i++) {
    const item = resolutions[i]!;
    resolutionByPair.set(pairKey(item.queryId, item.clipId), item);
  }
  const qrels: FinalQrel[] = [];
  const initial = annotationsInitial.annotations;
  for (let i = 0; i < initial.length; i++) {
    const item = initial[i]!;
    const resolution = resolutionByPair.get(pairKey(item.queryId, item.clipId));
    qrels.push({
      queryId: item.queryId,
      clipId: item.clipId,
      grade: resolution ? resolution.finalGrade : item.grade,
    });
  }
  qrels.sort((left, right) => {
    if (left.queryId !== right.queryId) {
      return left.queryId < right.queryId ? -1 : 1;
    }
    if (left.clipId !== right.clipId) {
      return left.clipId < right.clipId ? -1 : 1;
    }
    return 0;
  });
  return qrels;
}

function parseLicense(value: unknown, path: string) {
  const license = asRecord(value, path);
  return {
    id: asNonempty(license.id, `${path}.id`),
    evidenceRef: asNonempty(license.evidenceRef, `${path}.evidenceRef`),
  };
}

function parseRetrievalUnit(value: unknown, path: string) {
  const unit = asRecord(value, path);
  const startMs = asNumber(unit.startMs, `${path}.startMs`);
  const endMs = asNumber(unit.endMs, `${path}.endMs`);
  const durationMs = asNumber(unit.durationMs, `${path}.durationMs`);
  assert(startMs >= 0, `${path}.startMs must be >= 0`);
  assert(startMs < endMs, `${path} startMs must be < endMs`);
  assert(
    durationMs === endMs - startMs,
    `${path}.durationMs must equal endMs-startMs`
  );
  return { startMs, endMs, durationMs };
}

function parseClip(value: unknown, index: number): CalibrationClip {
  const path = `manifest.clips[${index}]`;
  const clip = asRecord(value, path);
  const id = asNonempty(clip.id, `${path}.id`);
  assert(!/^(demo-|syn-)/i.test(id), "ids must not begin with demo-/syn-");
  const rawMediaSha256 = asString(clip.rawMediaSha256, `${path}.rawMediaSha256`);
  assert(/^[0-9a-f]{64}$/.test(rawMediaSha256), `${path}.rawMediaSha256`);
  const canonicalTextVersion = asString(
    clip.canonicalTextVersion,
    `${path}.canonicalTextVersion`
  );
  assert(
    canonicalTextVersion === CANONICAL_TEXT_VERSION,
    `${path}.canonicalTextVersion must be ${CANONICAL_TEXT_VERSION}`
  );
  return {
    id,
    sourceRef: asNonempty(clip.sourceRef, `${path}.sourceRef`),
    license: parseLicense(clip.license, `${path}.license`),
    provenance: asNonempty(clip.provenance, `${path}.provenance`),
    rawMediaSha256,
    familyId: asNonempty(clip.familyId, `${path}.familyId`),
    corpusCoverageTags: asStringArray(
      clip.corpusCoverageTags,
      `${path}.corpusCoverageTags`
    ),
    retrievalUnit: parseRetrievalUnit(clip.retrievalUnit, `${path}.retrievalUnit`),
    metadataV2Version: asNonempty(
      clip.metadataV2Version,
      `${path}.metadataV2Version`
    ),
    canonicalTextVersion: CANONICAL_TEXT_VERSION,
    metadataV2: parseMetadataV2(clip.metadataV2, `${path}.metadataV2`),
  };
}

function parseHeader(
  value: unknown,
  path: string
): { schemaVersion: typeof CALIBRATION_SCHEMA_VERSION; snapshotId: string } {
  const record = asRecord(value, path);
  const schemaVersion = asString(record.schemaVersion, `${path}.schemaVersion`);
  assert(
    schemaVersion === CALIBRATION_SCHEMA_VERSION,
    `${path}.schemaVersion must be ${CALIBRATION_SCHEMA_VERSION}`
  );
  return {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: asNonempty(record.snapshotId, `${path}.snapshotId`),
  };
}

function parseManifest(value: unknown): CalibrationManifestFile {
  const record = asRecord(value, "manifest.json");
  const header = parseHeader(record, "manifest.json");
  const manifestVersion = asNonempty(
    record.manifestVersion,
    "manifest.json.manifestVersion"
  );
  const purpose = asString(record.purpose, "manifest.json.purpose");
  assert(
    purpose === "calibration-only",
    'manifest.json.purpose must be exactly "calibration-only"'
  );
  const clipsRaw = asArray(record.clips, "manifest.json.clips");
  const clips = clipsRaw.map((clip, index) => parseClip(clip, index));
  assert(clips.length === CALIBRATION_CLIP_COUNT, "manifest must have 24 clips");
  const ids: Set<string> = new Set();
  for (let i = 0; i < clips.length; i++) {
    assert(!ids.has(clips[i]!.id), "clip ids must be unique");
    ids.add(clips[i]!.id);
  }
  const familyCounts: Map<string, number> = new Map();
  for (let i = 0; i < clips.length; i++) {
    const familyId = clips[i]!.familyId;
    familyCounts.set(familyId, (familyCounts.get(familyId) ?? 0) + 1);
  }
  const counts = Array.from(familyCounts.values());
  assert(familyCounts.size >= 2, "anti-degeneracy requires >=2 familyId values");
  assert(
    counts.some(count => count >= 2),
    "anti-degeneracy requires a multi-clip family"
  );
  return {
    ...header,
    manifestVersion,
    purpose: "calibration-only",
    snapshotFrozenAt: asIso(record.snapshotFrozenAt, "manifest.json.snapshotFrozenAt"),
    clips,
  };
}

function parseIntent(value: unknown, index: number): CalibrationIntent {
  const path = `intents.json.intents[${index}]`;
  const intent = asRecord(value, path);
  const must = asStringArray(intent.must, `${path}.must`);
  const should = asStringArray(intent.should, `${path}.should`);
  const exclusions = asStringArray(intent.exclusions, `${path}.exclusions`);
  assert(must.length > 0, `${path}.must must be nonempty`);
  assert(should.length > 0, `${path}.should must be nonempty`);
  assert(exclusions.length > 0, `${path}.exclusions must be nonempty`);
  const missingRaw = intent.missingConstraint;
  const missingConstraint =
    missingRaw === null ? null : asString(missingRaw, `${path}.missingConstraint`);
  return {
    intentId: asNonempty(intent.intentId, `${path}.intentId`),
    title: asNonempty(intent.title, `${path}.title`),
    creatorScenario: asNonempty(intent.creatorScenario, `${path}.creatorScenario`),
    taskBackstory: asNonempty(intent.taskBackstory, `${path}.taskBackstory`),
    acceptableAmbiguity: asNonempty(
      intent.acceptableAmbiguity,
      `${path}.acceptableAmbiguity`
    ),
    must,
    should,
    exclusions,
    coverageTags: asCoverageTags(intent.coverageTags, `${path}.coverageTags`),
    translationEquivalent: asBoolean(
      intent.translationEquivalent,
      `${path}.translationEquivalent`
    ),
    missingConstraint,
  };
}

function parseIntents(value: unknown): CalibrationIntentsFile {
  const record = asRecord(value, "intents.json");
  const header = parseHeader(record, "intents.json");
  const raw = asArray(record.intents, "intents.json.intents");
  const intents = raw.map((intent, index) => parseIntent(intent, index));
  assert(intents.length === CALIBRATION_INTENT_COUNT, "must have 6 intents");
  const ids: Set<string> = new Set();
  for (let i = 0; i < intents.length; i++) {
    assert(!ids.has(intents[i]!.intentId), "intent ids must be unique");
    ids.add(intents[i]!.intentId);
  }
  return { ...header, intents };
}

function parseBlindDeclaration(
  value: unknown,
  path: string
): AuthorBlindnessDeclaration {
  const rec = asRecord(value, path);
  for (let i = 0; i < AUTHOR_BLIND_FLAGS.length; i++) {
    const flag = AUTHOR_BLIND_FLAGS[i]!;
    assert(rec[flag] === true, `${path}.${flag} must be true (blind authorship)`);
  }
  return {
    blindToCanonicalText: true,
    blindToSearchDocuments: true,
    blindToSynonymExpansion: true,
    blindToSystemIdentities: true,
    blindToRankings: true,
    blindToScores: true,
    blindToResultSets: true,
  };
}

function parseQuery(value: unknown, index: number): CalibrationQuery {
  const path = `queries.json.queries[${index}]`;
  const query = asRecord(value, path);
  const queryLanguage = asString(query.queryLanguage, `${path}.queryLanguage`);
  assert(
    queryLanguage === "en" || queryLanguage === "zh",
    `${path}.queryLanguage`
  );
  const languageRelation = asString(
    query.languageRelation,
    `${path}.languageRelation`
  );
  assert(
    languageRelation === "same-language" || languageRelation === "cross-lingual",
    `${path}.languageRelation`
  );
  const variantKind = asString(query.variantKind, `${path}.variantKind`);
  assert(
    VARIANT_KINDS.indexOf(variantKind as QueryVariantKind) >= 0,
    `${path}.variantKind`
  );
  const authorRef = asNonempty(query.authorRef, `${path}.authorRef`);
  assert(!/@|mailto:/i.test(authorRef), `${path}.authorRef must be opaque non-PII`);
  const evidenceLanguage = asString(
    query.searchableMetadataEvidenceLanguage,
    `${path}.searchableMetadataEvidenceLanguage`
  );
  assert(evidenceLanguage === "en", `${path}.searchableMetadataEvidenceLanguage`);
  if (queryLanguage === "en") {
    assert(languageRelation === "same-language", `${path}.languageRelation`);
  } else {
    assert(languageRelation === "cross-lingual", `${path}.languageRelation`);
  }
  const pairRaw = query.translationPairId;
  const translationPairId =
    pairRaw === null ? null : asNonempty(pairRaw, `${path}.translationPairId`);
  const probeRaw = query.overlapProbeQueryId;
  const overlapProbeQueryId =
    probeRaw === null ? null : asNonempty(probeRaw, `${path}.overlapProbeQueryId`);
  return {
    queryId: asNonempty(query.queryId, `${path}.queryId`),
    intentId: asNonempty(query.intentId, `${path}.intentId`),
    text: asNonempty(query.text, `${path}.text`),
    queryLanguage,
    searchableMetadataEvidenceLanguage: "en",
    languageRelation,
    variantKind: variantKind as QueryVariantKind,
    translationPairId,
    coverageTags: asCoverageTags(query.coverageTags, `${path}.coverageTags`),
    authorRef,
    authorRole: asNonempty(query.authorRole, `${path}.authorRole`),
    authoredAt: asIso(query.authoredAt, `${path}.authoredAt`),
    blindAuthorshipDeclaration: parseBlindDeclaration(
      query.blindAuthorshipDeclaration,
      `${path}.blindAuthorshipDeclaration`
    ),
    overlapProbeQueryId,
  };
}

function parseQueries(value: unknown): CalibrationQueriesFile {
  const record = asRecord(value, "queries.json");
  const header = parseHeader(record, "queries.json");
  const raw = asArray(record.queries, "queries.json.queries");
  const queries = raw.map((query, index) => parseQuery(query, index));
  assert(queries.length === CALIBRATION_QUERY_COUNT, "must have 10 queries");
  const ids: Set<string> = new Set();
  for (let i = 0; i < queries.length; i++) {
    assert(!ids.has(queries[i]!.queryId), "query ids must be unique");
    ids.add(queries[i]!.queryId);
  }
  return { ...header, queries };
}

function parseHidden(
  value: unknown,
  path: string,
  requireInitialHide: boolean
): PresentationHiddenFlags {
  const rec = asRecord(value, path);
  for (let i = 0; i < HIDDEN_FLAGS.length; i++) {
    const flag = HIDDEN_FLAGS[i]!;
    assert(rec[flag] === true, `${path}.${flag} must be true`);
  }
  if (requireInitialHide) {
    assert(
      rec.hideInitialOrderAndGrade === true,
      `${path}.hideInitialOrderAndGrade must be true`
    );
  }
  const hidden: PresentationHiddenFlags = {
    hideMetadataV2: true,
    hideCanonicalText: true,
    hideSearchDocuments: true,
    hideSynonymExpansion: true,
    hideSystemIdentity: true,
    hideRankings: true,
    hideScores: true,
    hideResultSets: true,
    hideProvenanceAndLicense: true,
    hidePriorLabels: true,
  };
  if (requireInitialHide) hidden.hideInitialOrderAndGrade = true;
  return hidden;
}

function parsePresentation(
  value: unknown,
  path: string,
  requireInitialHide: boolean
): CalibrationPresentationFile {
  const record = asRecord(value, path);
  const header = parseHeader(record, path);
  assert(record.judgingMode === "full-clip", `${path}.judgingMode`);
  assert(record.fullClipPlaybackRequired === true, `${path}.fullClipPlaybackRequired`);
  const rows = asArray(record.presentations, `${path}.presentations`);
  const presentations: Array<{ queryId: string; clipOrder: string[] }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = asRecord(rows[i], `${path}.presentations[${i}]`);
    presentations.push({
      queryId: asNonempty(row.queryId, `${path}.presentations[${i}].queryId`),
      clipOrder: asStringArray(row.clipOrder, `${path}.presentations[${i}].clipOrder`),
    });
  }
  return {
    ...header,
    generatedAt: asIso(record.generatedAt, `${path}.generatedAt`),
    judgingMode: "full-clip",
    fullClipPlaybackRequired: true,
    randomizationMethod: asNonempty(
      record.randomizationMethod,
      `${path}.randomizationMethod`
    ),
    randomizationVersion: asNonempty(
      record.randomizationVersion,
      `${path}.randomizationVersion`
    ),
    hidden: parseHidden(record.hidden, `${path}.hidden`, requireInitialHide),
    presentations,
  };
}

function parseAnnotation(
  value: unknown,
  path: string
): CalibrationAnnotation {
  const rec = asRecord(value, path);
  assert(rec.fullClipJudged === true, `${path}.fullClipJudged`);
  const grade = asGrade(rec.grade, `${path}.grade`);
  const evidenceRaw = asArray(rec.evidence, `${path}.evidence`);
  const evidence: CalibrationEvidence[] = [];
  for (let i = 0; i < evidenceRaw.length; i++) {
    const item = asRecord(evidenceRaw[i], `${path}.evidence[${i}]`);
    evidence.push({
      timestampMs: asNumber(item.timestampMs, `${path}.evidence[${i}].timestampMs`),
      note: asNonempty(item.note, `${path}.evidence[${i}].note`),
    });
  }
  const nonfitRaw = rec.nonfitReason;
  const nonfitReason =
    nonfitRaw === null ? null : asString(nonfitRaw, `${path}.nonfitReason`);
  if (grade >= 2) {
    assert(evidence.length > 0, `${path}.evidence required for grade>=2`);
  } else {
    assert(
      typeof nonfitReason === "string" && nonfitReason.trim().length > 0,
      `${path}.nonfitReason required for grade<2`
    );
  }
  return {
    queryId: asNonempty(rec.queryId, `${path}.queryId`),
    clipId: asNonempty(rec.clipId, `${path}.clipId`),
    fullClipJudged: true,
    grade,
    reason: asNonempty(rec.reason, `${path}.reason`),
    evidence,
    nonfitReason,
  };
}

function parseAnnotations(
  value: unknown,
  path: string
): CalibrationAnnotationsFile {
  const record = asRecord(value, path);
  const header = parseHeader(record, path);
  const raw = asArray(record.annotations, `${path}.annotations`);
  const annotations = raw.map((item, index) =>
    parseAnnotation(item, `${path}.annotations[${index}]`)
  );
  return {
    ...header,
    startedAt: asIso(record.startedAt, `${path}.startedAt`),
    completedAt: asIso(record.completedAt, `${path}.completedAt`),
    annotations,
  };
}

function parseRepeatSubset(value: unknown): CalibrationRepeatSubsetFile {
  const record = asRecord(value, "repeat-subset.json");
  const header = parseHeader(record, "repeat-subset.json");
  const washoutStartedAt = asIso(
    record.washoutStartedAt,
    "repeat-subset.json.washoutStartedAt"
  );
  const washoutEndedAt = asIso(
    record.washoutEndedAt,
    "repeat-subset.json.washoutEndedAt"
  );
  const washoutIntervalMs = asNumber(
    record.washoutIntervalMs,
    "repeat-subset.json.washoutIntervalMs"
  );
  assert(washoutIntervalMs > 0, "washoutIntervalMs must be strictly positive");
  const washoutStart = Date.parse(washoutStartedAt);
  const washoutEnd = Date.parse(washoutEndedAt);
  assert(
    washoutEnd > washoutStart,
    "washoutEndedAt must be > washoutStartedAt"
  );
  assert(
    washoutIntervalMs === washoutEnd - washoutStart,
    "washoutIntervalMs must equal washoutEndedAt-washoutStartedAt"
  );
  const pairsRaw = asArray(record.pairs, "repeat-subset.json.pairs");
  const pairs: RepeatPair[] = [];
  for (let i = 0; i < pairsRaw.length; i++) {
    const row = asRecord(pairsRaw[i], `repeat-subset.json.pairs[${i}]`);
    pairs.push({
      queryId: asNonempty(row.queryId, `repeat-subset.json.pairs[${i}].queryId`),
      clipId: asNonempty(row.clipId, `repeat-subset.json.pairs[${i}].clipId`),
    });
  }
  const strata = asStringArray(record.strata, "repeat-subset.json.strata");
  for (let i = 0; i < REPEAT_STRATA.length; i++) {
    assert(
      strata.indexOf(REPEAT_STRATA[i]!) >= 0,
      `repeat-subset.json.strata must include ${REPEAT_STRATA[i]}`
    );
  }
  return {
    ...header,
    frozenAt: asIso(record.frozenAt, "repeat-subset.json.frozenAt"),
    washoutStartedAt,
    washoutEndedAt,
    washoutIntervalMs,
    selectionMethod: asNonempty(
      record.selectionMethod,
      "repeat-subset.json.selectionMethod"
    ),
    strata,
    pairs,
  };
}

function parseSelfResolutions(value: unknown): CalibrationSelfResolutionsFile {
  const record = asRecord(value, "self-resolutions.json");
  const header = parseHeader(record, "self-resolutions.json");
  const raw = asArray(record.resolutions, "self-resolutions.json.resolutions");
  const resolutions: SelfResolution[] = [];
  for (let i = 0; i < raw.length; i++) {
    const path = `self-resolutions.json.resolutions[${i}]`;
    const item = asRecord(raw[i], path);
    resolutions.push({
      queryId: asNonempty(item.queryId, `${path}.queryId`),
      clipId: asNonempty(item.clipId, `${path}.clipId`),
      initialGrade: asGrade(item.initialGrade, `${path}.initialGrade`),
      repeatGrade: asGrade(item.repeatGrade, `${path}.repeatGrade`),
      finalGrade: asGrade(item.finalGrade, `${path}.finalGrade`),
      resolutionReason: asNonempty(
        item.resolutionReason,
        `${path}.resolutionReason`
      ),
      resolvedAt: asIso(item.resolvedAt, `${path}.resolvedAt`),
    });
  }
  return {
    ...header,
    startedAt: asIso(record.startedAt, "self-resolutions.json.startedAt"),
    completedAt: asIso(record.completedAt, "self-resolutions.json.completedAt"),
    resolutions,
  };
}

function parseEvaluationRecord(
  value: unknown
): CalibrationEvaluationRecordFile {
  const record = asRecord(value, "evaluation-record.json");
  const header = parseHeader(record, "evaluation-record.json");
  const qrelsRaw = asArray(record.finalQrels, "evaluation-record.json.finalQrels");
  const finalQrels: FinalQrel[] = [];
  for (let i = 0; i < qrelsRaw.length; i++) {
    const path = `evaluation-record.json.finalQrels[${i}]`;
    const item = asRecord(qrelsRaw[i], path);
    finalQrels.push({
      queryId: asNonempty(item.queryId, `${path}.queryId`),
      clipId: asNonempty(item.clipId, `${path}.clipId`),
      grade: asGrade(item.grade, `${path}.grade`),
    });
  }
  const encoded = JSON.stringify(record);
  assert(
    !/evidenceHash|nested.*hash|dependencyGraph/i.test(encoded),
    "evaluation-record must not contain nested hashes"
  );
  return {
    ...header,
    generatedAt: asIso(record.generatedAt, "evaluation-record.json.generatedAt"),
    finalQrels,
    finalQrelsSha256: asString(
      record.finalQrelsSha256,
      "evaluation-record.json.finalQrelsSha256"
    ),
  };
}

function parseSnapshotIndex(value: unknown): CalibrationSnapshotIndexFile {
  const record = asRecord(value, "snapshot-index.json");
  const header = parseHeader(record, "snapshot-index.json");
  const map = asRecord(record.sha256ByArtifact, "snapshot-index.json.sha256ByArtifact");
  assert(
    !("snapshot-index.json" in map),
    "snapshot-index must not include a self-checksum"
  );
  const sha256ByArtifact: Record<string, string> = {};
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const hash = asString(map[key], `snapshot-index.json.sha256ByArtifact.${key}`);
    assert(/^[0-9a-f]{64}$/.test(hash), `snapshot-index hash for ${key}`);
    sha256ByArtifact[key] = hash;
  }
  const encoded = JSON.stringify(record);
  assert(
    !/dependencyGraph|nestedHashes/i.test(encoded),
    "snapshot-index must not contain nested hashes"
  );
  return {
    ...header,
    generatedAt: asIso(record.generatedAt, "snapshot-index.json.generatedAt"),
    sha256ByArtifact,
  };
}

function assertPermutation(actual: string[], expected: string[], path: string) {
  assert(actual.length === expected.length, `${path} permutation length`);
  const expectedSet: Set<string> = new Set(expected);
  const actualSet: Set<string> = new Set(actual);
  assert(actualSet.size === actual.length, `${path} clipOrder must be unique`);
  assert(expectedSet.size === expected.length, `${path} expected ids unique`);
  const expectedList = Array.from(expectedSet);
  for (let i = 0; i < expectedList.length; i++) {
    assert(actualSet.has(expectedList[i]!), `${path} missing ${expectedList[i]}`);
  }
}

function assertLeq(left: number, right: number, message: string) {
  assert(left <= right, message);
}

export function parseCalibrationBundle(
  bundle: CalibrationArtifactBundle,
  options?: { rawUtf8ByArtifact?: Partial<Record<string, string>> }
): CalibrationSnapshot {
  const record = asRecord(bundle, "calibration bundle");
  const topKeys = Object.keys(record).sort();
  const expectedTop = CALIBRATION_ARTIFACT_NAMES.slice().sort();
  assert(
    JSON.stringify(topKeys) === JSON.stringify(expectedTop),
    "calibration bundle top-level artifacts must equal CALIBRATION_ARTIFACT_NAMES exactly (no missing or extra)"
  );
  assertNoForbiddenPayload(bundle);

  const manifest = parseManifest(record["manifest.json"]);
  const intents = parseIntents(record["intents.json"]);
  const queries = parseQueries(record["queries.json"]);
  const presentationInitial = parsePresentation(
    record["presentation.initial.json"],
    "presentation.initial.json",
    false
  );
  const annotationsInitial = parseAnnotations(
    record["annotations.initial.json"],
    "annotations.initial.json"
  );
  const repeatSubset = parseRepeatSubset(record["repeat-subset.json"]);
  const presentationRepeat = parsePresentation(
    record["presentation.repeat.json"],
    "presentation.repeat.json",
    true
  );
  const annotationsRepeat = parseAnnotations(
    record["annotations.repeat.json"],
    "annotations.repeat.json"
  );
  const selfResolutions = parseSelfResolutions(record["self-resolutions.json"]);
  const evaluationRecord = parseEvaluationRecord(record["evaluation-record.json"]);
  const snapshotIndex = parseSnapshotIndex(record["snapshot-index.json"]);

  const snapshotId = manifest.snapshotId;
  const files = [
    manifest,
    intents,
    queries,
    presentationInitial,
    annotationsInitial,
    repeatSubset,
    presentationRepeat,
    annotationsRepeat,
    selfResolutions,
    evaluationRecord,
    snapshotIndex,
  ];
  for (let i = 0; i < files.length; i++) {
    assert(files[i]!.snapshotId === snapshotId, "snapshotId mismatch");
    assert(
      files[i]!.schemaVersion === CALIBRATION_SCHEMA_VERSION,
      "schemaVersion mismatch"
    );
  }

  const hashedNames = CALIBRATION_ARTIFACT_NAMES.filter(
    name => name !== "snapshot-index.json"
  );
  const indexKeys = Object.keys(snapshotIndex.sha256ByArtifact).sort();
  const expectedKeys = hashedNames.slice().sort();
  assert(
    JSON.stringify(indexKeys) === JSON.stringify(expectedKeys),
    "snapshot-index must hash every other artifact exactly once"
  );
  for (let i = 0; i < hashedNames.length; i++) {
    const name = hashedNames[i]!;
    const expected = snapshotIndex.sha256ByArtifact[name];
    const raw = options?.rawUtf8ByArtifact?.[name];
    if (raw !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(
          `rawUtf8ByArtifact ${name}: malformed JSON utf8 bytes`
        );
      }
      assert(
        isDeepStrictEqual(parsed, record[name]),
        `rawUtf8ByArtifact ${name}: byte bind mismatch with bundle artifact`
      );
      assert(
        sha256Utf8(raw) === expected,
        `snapshot-index hash mismatch for ${name}`
      );
    } else {
      assert(
        sha256CanonicalJson(record[name]) === expected,
        `snapshot-index hash mismatch for ${name}`
      );
    }
  }

  const clipById: Map<string, CalibrationClip> = new Map();
  for (let i = 0; i < manifest.clips.length; i++) {
    clipById.set(manifest.clips[i]!.id, manifest.clips[i]!);
  }
  const clipIds = manifest.clips.map(clip => clip.id);
  const intentById: Map<string, CalibrationIntent> = new Map();
  for (let i = 0; i < intents.intents.length; i++) {
    intentById.set(intents.intents[i]!.intentId, intents.intents[i]!);
  }
  const queryById: Map<string, CalibrationQuery> = new Map();
  for (let i = 0; i < queries.queries.length; i++) {
    queryById.set(queries.queries[i]!.queryId, queries.queries[i]!);
  }

  for (let i = 0; i < queries.queries.length; i++) {
    const query = queries.queries[i]!;
    assert(intentById.has(query.intentId), `unknown intent ${query.intentId}`);
  }

  const translationEn = queries.queries.filter(
    query => query.variantKind === "translation-en"
  );
  const translationZh = queries.queries.filter(
    query => query.variantKind === "translation-zh"
  );
  assert(translationEn.length === 4, "need four translation-en queries");
  assert(translationZh.length === 4, "need four translation-zh queries");
  assert(
    queries.queries.filter(query => query.variantKind === "natural-zh").length === 1,
    "need one natural-zh query"
  );
  assert(
    queries.queries.filter(query => query.variantKind === "hard-negative-en")
      .length === 1,
    "need one hard-negative-en query"
  );
  const pairIds: Set<string> = new Set();
  for (let i = 0; i < translationEn.length; i++) {
    const pairId = translationEn[i]!.translationPairId;
    assert(pairId, "translation-en requires translationPairId");
    pairIds.add(pairId);
  }
  assert(pairIds.size === 4, "need four translation pairs");
  const pairIdList = Array.from(pairIds);
  const translationIntentIds: Set<string> = new Set();
  for (let i = 0; i < pairIdList.length; i++) {
    const pairId = pairIdList[i]!;
    const en = translationEn.find(query => query.translationPairId === pairId);
    const zh = translationZh.find(query => query.translationPairId === pairId);
    assert(en, `translation pair ${pairId} needs en`);
    assert(zh, `translation pair ${pairId} needs zh`);
    assert(en.intentId === zh.intentId, `translation pair ${pairId} intent mismatch`);
    translationIntentIds.add(en.intentId);
    const pairIntent = intentById.get(en.intentId);
    assert(pairIntent, `unknown intent ${en.intentId}`);
    assert(
      pairIntent.translationEquivalent === true,
      `translation pair intent ${en.intentId} must have translationEquivalent=true`
    );
  }
  assert(
    translationIntentIds.size === 4,
    "four translation pairs must map to four independent intents"
  );

  const naturalZh = queries.queries.find(
    query => query.variantKind === "natural-zh"
  )!;
  const hardNeg = queries.queries.find(
    query => query.variantKind === "hard-negative-en"
  )!;
  assert(
    naturalZh.intentId !== hardNeg.intentId,
    "natural-zh and hard-negative-en must use independent intents"
  );
  assert(
    !translationIntentIds.has(naturalZh.intentId),
    "natural-zh intent must be independent of translation-pair intents"
  );
  assert(
    !translationIntentIds.has(hardNeg.intentId),
    "hard-negative-en intent must be independent of translation-pair intents"
  );
  const naturalIntent = intentById.get(naturalZh.intentId)!;
  const hardNegIntent = intentById.get(hardNeg.intentId)!;
  assert(
    naturalIntent.translationEquivalent === false,
    `natural-zh intent ${naturalZh.intentId} must have translationEquivalent=false`
  );
  assert(
    hardNegIntent.translationEquivalent === false,
    `hard-negative-en intent ${hardNeg.intentId} must have translationEquivalent=false`
  );

  const queriedIntentIds: Set<string> = new Set();
  for (let i = 0; i < queries.queries.length; i++) {
    queriedIntentIds.add(queries.queries[i]!.intentId);
  }
  assert(
    queriedIntentIds.size === CALIBRATION_INTENT_COUNT,
    "queries must reference exactly six independent intents"
  );
  for (let i = 0; i < intents.intents.length; i++) {
    assert(
      queriedIntentIds.has(intents.intents[i]!.intentId),
      `declared intent ${intents.intents[i]!.intentId} is unused by queries`
    );
  }

  for (let i = 0; i < queries.queries.length; i++) {
    const query = queries.queries[i]!;
    if (
      query.variantKind === "natural-zh" ||
      query.variantKind === "hard-negative-en"
    ) {
      assert(query.translationPairId === null, `${query.queryId} pair must be null`);
    }
    if (query.coverageTags.indexOf("zero-overlap") >= 0) {
      const probeId = query.overlapProbeQueryId;
      assert(
        probeId,
        `zero-overlap query ${query.queryId} requires overlapProbeQueryId`
      );
      const probe = queryById.get(probeId);
      assert(
        probe,
        `zero-overlap overlapProbeQueryId probe missing for ${query.queryId}`
      );
      if (query.queryLanguage === "en") {
        assert(
          probeId === query.queryId,
          `zero-overlap English query ${query.queryId} overlapProbeQueryId must be self`
        );
        assert(
          probe.queryLanguage === "en",
          `zero-overlap overlapProbeQueryId must be an English probe`
        );
      } else {
        assert(
          query.variantKind === "translation-zh",
          `zero-overlap ZH query ${query.queryId} must be translation-zh with paired English probe`
        );
        assert(
          query.translationPairId !== null,
          `zero-overlap ZH query ${query.queryId} requires nonnull translationPairId`
        );
        assert(
          probe.queryLanguage === "en" && probe.variantKind === "translation-en",
          `zero-overlap ZH overlapProbeQueryId must be an English translation-en probe`
        );
        const pairedEn: CalibrationQuery[] = [];
        for (let j = 0; j < queries.queries.length; j++) {
          const candidate = queries.queries[j]!;
          if (
            candidate.variantKind === "translation-en" &&
            candidate.intentId === query.intentId &&
            candidate.translationPairId === query.translationPairId
          ) {
            pairedEn.push(candidate);
          }
        }
        assert(
          pairedEn.length === 1 && pairedEn[0]!.queryId === probeId,
          `zero-overlap ZH probe must be the unique translation-en with identical intentId and translationPairId`
        );
      }
    }
  }
  assert(
    typeof hardNegIntent.missingConstraint === "string" &&
      hardNegIntent.missingConstraint.trim().length > 0,
    "hard-negative intent missingConstraint must be nonempty"
  );

  const coverageUnion: Set<string> = new Set();
  for (let i = 0; i < queries.queries.length; i++) {
    const tags = queries.queries[i]!.coverageTags;
    for (let j = 0; j < tags.length; j++) coverageUnion.add(tags[j]!);
  }
  for (let i = 0; i < COVERAGE_TAG_DIMENSIONS.length; i++) {
    const dim = COVERAGE_TAG_DIMENSIONS[i]!;
    assert(coverageUnion.has(dim), `coverage union missing ${dim}`);
  }

  assert(
    annotationsInitial.annotations.length === CALIBRATION_INITIAL_LABEL_COUNT,
    "initial annotations must be 240"
  );
  const initialByPair = annotationMap(annotationsInitial.annotations);
  assert(
    initialByPair.size === CALIBRATION_INITIAL_LABEL_COUNT,
    "initial labels must be unique"
  );
  for (let q = 0; q < queries.queries.length; q++) {
    for (let c = 0; c < manifest.clips.length; c++) {
      const key = pairKey(queries.queries[q]!.queryId, manifest.clips[c]!.id);
      assert(initialByPair.has(key), `missing initial label ${key}`);
    }
  }
  function assertEvidenceInUnit(item: CalibrationAnnotation) {
    const clip = clipById.get(item.clipId);
    assert(clip, `unknown clip ${item.clipId}`);
    assert(queryById.has(item.queryId), `unknown query ${item.queryId}`);
    for (let e = 0; e < item.evidence.length; e++) {
      const ts = item.evidence[e]!.timestampMs;
      assert(ts >= 0, "evidence timestampMs must be >= 0");
      assert(
        ts <= clip.retrievalUnit.durationMs,
        "evidence timestampMs must be within retrievalUnit durationMs"
      );
    }
  }
  const initialList = Array.from(initialByPair.values());
  for (let i = 0; i < initialList.length; i++) {
    assertEvidenceInUnit(initialList[i]!);
  }

  assert(
    repeatSubset.pairs.length === CALIBRATION_REPEAT_LABEL_COUNT,
    "repeat subset must have 60 pairs"
  );
  assert(
    annotationsRepeat.annotations.length === CALIBRATION_REPEAT_LABEL_COUNT,
    "repeat annotations must be 60"
  );
  const repeatPairSet: Set<string> = new Set();
  for (let i = 0; i < repeatSubset.pairs.length; i++) {
    const pair = repeatSubset.pairs[i]!;
    const key = pairKey(pair.queryId, pair.clipId);
    assert(initialByPair.has(key), `repeat pair is not a subset of initial ${key}`);
    assert(!repeatPairSet.has(key), `duplicate repeat pair ${key}`);
    repeatPairSet.add(key);
  }
  for (let q = 0; q < queries.queries.length; q++) {
    const queryId = queries.queries[q]!.queryId;
    const count = repeatSubset.pairs.filter(pair => pair.queryId === queryId).length;
    assert(count === CALIBRATION_REPEAT_PER_QUERY, `need 6 repeat pairs for ${queryId}`);
  }
  const repeatByPair = annotationMap(annotationsRepeat.annotations);
  assert(repeatByPair.size === CALIBRATION_REPEAT_LABEL_COUNT, "repeat labels unique");
  const repeatKeys = Array.from(repeatPairSet);
  for (let i = 0; i < repeatKeys.length; i++) {
    assert(repeatByPair.has(repeatKeys[i]!), `missing repeat annotation ${repeatKeys[i]}`);
  }
  const extraRepeat = Array.from(repeatByPair.keys());
  for (let i = 0; i < extraRepeat.length; i++) {
    assert(repeatPairSet.has(extraRepeat[i]!), "repeat annotation not in subset");
  }
  const repeatList = Array.from(repeatByPair.values());
  for (let i = 0; i < repeatList.length; i++) {
    assertEvidenceInUnit(repeatList[i]!);
  }

  const languages: Set<string> = new Set();
  const variants: Set<string> = new Set();
  const tagsSeen: Set<string> = new Set();
  const gradesSeen: Set<number> = new Set();
  let sawHardNegative = false;
  let sawMultiFamilyClip = false;
  const familySize = familyCountsFrom(manifest.clips);
  for (let i = 0; i < repeatSubset.pairs.length; i++) {
    const pair = repeatSubset.pairs[i]!;
    const query = queryById.get(pair.queryId)!;
    const clip = clipById.get(pair.clipId)!;
    const initial = initialByPair.get(pairKey(pair.queryId, pair.clipId))!;
    languages.add(query.queryLanguage);
    variants.add(query.variantKind);
    for (let t = 0; t < query.coverageTags.length; t++) {
      tagsSeen.add(query.coverageTags[t]!);
    }
    gradesSeen.add(initial.grade);
    if (query.variantKind === "hard-negative-en") sawHardNegative = true;
    if ((familySize.get(clip.familyId) ?? 0) >= 2) sawMultiFamilyClip = true;
  }
  assert(languages.has("en") && languages.has("zh"), "repeat subset must cover both languages");
  for (let i = 0; i < VARIANT_KINDS.length; i++) {
    assert(variants.has(VARIANT_KINDS[i]!), `repeat subset missing ${VARIANT_KINDS[i]}`);
  }
  for (let i = 0; i < COVERAGE_TAG_DIMENSIONS.length; i++) {
    assert(
      tagsSeen.has(COVERAGE_TAG_DIMENSIONS[i]!),
      `repeat subset missing coverage ${COVERAGE_TAG_DIMENSIONS[i]}`
    );
  }
  assert(sawHardNegative, "repeat subset must include hard-negative cases");
  assert(sawMultiFamilyClip, "repeat subset must include a multi-clip family");
  const occurringGrades: Set<number> = new Set();
  for (let i = 0; i < annotationsInitial.annotations.length; i++) {
    occurringGrades.add(annotationsInitial.annotations[i]!.grade);
  }
  const occurringList = Array.from(occurringGrades);
  for (let i = 0; i < occurringList.length; i++) {
    assert(
      gradesSeen.has(occurringList[i]!),
      `repeat subset missing initial grade ${occurringList[i]}`
    );
  }

  const disagreeKeys: Set<string> = new Set();
  const repeatAnns = Array.from(repeatByPair.values());
  for (let i = 0; i < repeatAnns.length; i++) {
    const repeat = repeatAnns[i]!;
    const initial = initialByPair.get(pairKey(repeat.queryId, repeat.clipId))!;
    if (initial.grade !== repeat.grade) {
      disagreeKeys.add(pairKey(repeat.queryId, repeat.clipId));
    }
  }
  const resolutionKeys: Set<string> = new Set();
  for (let i = 0; i < selfResolutions.resolutions.length; i++) {
    const item = selfResolutions.resolutions[i]!;
    const key = pairKey(item.queryId, item.clipId);
    assert(!resolutionKeys.has(key), `duplicate self-resolution ${key}`);
    resolutionKeys.add(key);
    const initial = initialByPair.get(key);
    const repeat = repeatByPair.get(key);
    assert(initial && repeat, `self-resolution ${key} must be a repeated pair`);
    assert(item.initialGrade === initial.grade, `self-resolution ${key} initialGrade`);
    assert(item.repeatGrade === repeat.grade, `self-resolution ${key} repeatGrade`);
  }
  const disagreeList = Array.from(disagreeKeys).sort();
  const resolutionList = Array.from(resolutionKeys).sort();
  assert(
    JSON.stringify(disagreeList) === JSON.stringify(resolutionList),
    "self-resolutions must cover every-and-only disagreements"
  );

  assert(
    presentationInitial.presentations.length === CALIBRATION_QUERY_COUNT,
    "initial presentation rows"
  );
  for (let i = 0; i < queries.queries.length; i++) {
    const query = queries.queries[i]!;
    const row = presentationInitial.presentations.find(
      item => item.queryId === query.queryId
    );
    assert(row, `missing initial presentation for ${query.queryId}`);
    assertPermutation(row.clipOrder, clipIds, `presentation.initial ${query.queryId}`);
  }
  assert(
    presentationRepeat.presentations.length === CALIBRATION_QUERY_COUNT,
    "presentation.repeat must contain exactly CALIBRATION_QUERY_COUNT rows"
  );
  const repeatPresentationSeen: Set<string> = new Set();
  for (let i = 0; i < presentationRepeat.presentations.length; i++) {
    const qid = presentationRepeat.presentations[i]!.queryId;
    assert(
      !repeatPresentationSeen.has(qid),
      `presentation.repeat duplicate query row ${qid}`
    );
    repeatPresentationSeen.add(qid);
  }
  for (let i = 0; i < queries.queries.length; i++) {
    const query = queries.queries[i]!;
    assert(
      repeatPresentationSeen.has(query.queryId),
      `missing repeat presentation for ${query.queryId}`
    );
    const row = presentationRepeat.presentations.find(
      item => item.queryId === query.queryId
    )!;
    const expected = repeatSubset.pairs
      .filter(pair => pair.queryId === query.queryId)
      .map(pair => pair.clipId);
    assertPermutation(row.clipOrder, expected, `presentation.repeat ${query.queryId}`);
  }

  const authoredTimes = queries.queries.map(query => Date.parse(query.authoredAt));
  const authoredMax = Math.max.apply(null, authoredTimes);
  const frozen = Date.parse(manifest.snapshotFrozenAt);
  const initialGen = Date.parse(presentationInitial.generatedAt);
  const initialStart = Date.parse(annotationsInitial.startedAt);
  const initialDone = Date.parse(annotationsInitial.completedAt);
  const subsetFrozen = Date.parse(repeatSubset.frozenAt);
  const washoutStart = Date.parse(repeatSubset.washoutStartedAt);
  const washoutEnd = Date.parse(repeatSubset.washoutEndedAt);
  const repeatGen = Date.parse(presentationRepeat.generatedAt);
  const repeatStart = Date.parse(annotationsRepeat.startedAt);
  const repeatDone = Date.parse(annotationsRepeat.completedAt);
  const resolveStart = Date.parse(selfResolutions.startedAt);
  const resolveDone = Date.parse(selfResolutions.completedAt);
  const evalGen = Date.parse(evaluationRecord.generatedAt);
  const indexGen = Date.parse(snapshotIndex.generatedAt);
  assertLeq(
    authoredMax,
    frozen,
    "authoredAt must be <= snapshotFrozenAt (freeze)"
  );
  assertLeq(authoredMax, initialGen, "authoredAt must be <= initial presentation");
  assertLeq(frozen, initialGen, "snapshotFrozenAt must be <= initial presentation");
  assertLeq(initialGen, initialStart, "initial presentation must be <= annotation start");
  assertLeq(initialStart, initialDone, "initial annotation start must be <= completion");
  assertLeq(initialDone, subsetFrozen, "initial completion must be <= repeat-subset freeze");
  assert(
    washoutStart >= initialDone,
    "washoutStartedAt must be >= initial annotation completedAt"
  );
  assertLeq(
    subsetFrozen,
    washoutStart,
    "repeatSubset.frozenAt must be <= washoutStartedAt"
  );
  assert(
    washoutEnd <= repeatGen,
    "washoutEndedAt must be <= repeat presentation generatedAt"
  );
  assertLeq(subsetFrozen, repeatGen, "repeat-subset freeze must be <= repeat presentation");
  assert(repeatGen < repeatStart, "repeat presentation must be < repeat start");
  assertLeq(repeatStart, repeatDone, "repeat start must be <= completion");
  assertLeq(repeatDone, resolveStart, "repeat completion must be <= resolution start");
  assertLeq(resolveStart, resolveDone, "resolution start must be <= completion");
  for (let i = 0; i < selfResolutions.resolutions.length; i++) {
    const at = Date.parse(selfResolutions.resolutions[i]!.resolvedAt);
    assert(
      at >= resolveStart && at <= resolveDone,
      `self-resolution resolvedAt must lie within startedAt/completedAt lifecycle`
    );
  }
  assertLeq(resolveDone, evalGen, "resolution completion must be <= evaluation generatedAt");
  assertLeq(evalGen, indexGen, "evaluation generatedAt must be <= snapshot-index generatedAt");

  const derived = deriveFinalQrels(annotationsInitial, selfResolutions);
  assert(
    JSON.stringify(derived) === JSON.stringify(evaluationRecord.finalQrels),
    "evaluation-record.finalQrels must match derived qrels"
  );
  assert(
    /^[0-9a-f]{64}$/.test(evaluationRecord.finalQrelsSha256),
    "finalQrelsSha256"
  );
  assert(
    evaluationRecord.finalQrelsSha256 === finalQrelsSha256(evaluationRecord.finalQrels),
    "finalQrelsSha256 mismatch"
  );

  const grade2ByQuery: Map<string, number> = new Map();
  for (let i = 0; i < derived.length; i++) {
    const row = derived[i]!;
    if (row.grade < 2) continue;
    grade2ByQuery.set(row.queryId, (grade2ByQuery.get(row.queryId) ?? 0) + 1);
  }
  for (let i = 0; i < queries.queries.length; i++) {
    const queryId = queries.queries[i]!.queryId;
    assert(
      (grade2ByQuery.get(queryId) ?? 0) >= 1,
      `query ${queryId} needs a grade>=2 clip`
    );
  }

  return {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId,
    manifest,
    intents,
    queries,
    presentationInitial,
    annotationsInitial,
    repeatSubset,
    presentationRepeat,
    annotationsRepeat,
    selfResolutions,
    evaluationRecord,
    snapshotIndex,
  };
}

function familyCountsFrom(clips: CalibrationClip[]): Map<string, number> {
  const familyCounts: Map<string, number> = new Map();
  for (let i = 0; i < clips.length; i++) {
    const familyId = clips[i]!.familyId;
    familyCounts.set(familyId, (familyCounts.get(familyId) ?? 0) + 1);
  }
  return familyCounts;
}

function toFootage(clips: CalibrationClip[]): {
  footage: FootageClip[];
  idByNumeric: Map<number, string>;
} {
  const footage: FootageClip[] = [];
  const idByNumeric: Map<number, string> = new Map();
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    const numericId = i + 1;
    idByNumeric.set(numericId, clip.id);
    footage.push({
      id: numericId,
      projectIds: [],
      fileName: `${clip.id}.mov`,
      durationMs: clip.retrievalUnit.durationMs,
      thumbnailUrl: null,
      mediaUrl: null,
      status: "ready",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      ...metadataV2ToLegacy(clip.metadataV2),
      metadataJson: clip.metadataV2,
    });
  }
  return { footage, idByNumeric };
}

function toHits(
  ranked: Array<{ clip: FootageClip; score: number; reasons: string[] }>,
  idByNumeric: Map<number, string>
): CalibrationRankedHit[] {
  const hits: CalibrationRankedHit[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const item = ranked[i]!;
    if (item.score <= 0) continue;
    hits.push({
      clipId: idByNumeric.get(item.clip.id) ?? String(item.clip.id),
      score: item.score,
      reasons: item.reasons,
    });
  }
  return hits;
}

function notesForHits(
  ranking: CalibrationRankedHit[],
  notes: QualitativeHitNote[] | undefined,
  path: string
): QualitativeHitNote[] {
  const top = ranking.slice(0, 5);
  const provided = notes ?? [];
  assert(
    provided.length === top.length,
    `qualitative notes required for every top-5 hit (${path})`
  );
  const matched: QualitativeHitNote[] = [];
  for (let i = 0; i < top.length; i++) {
    const note = provided[i];
    assert(note, `qualitative notes required for ${path} rank ${i + 1}`);
    assert(note.clipId === top[i]!.clipId, `qualitative notes clip mismatch at ${path}`);
    assert(note.rank === i + 1, `qualitative notes rank mismatch at ${path}`);
    assert(
      typeof note.note === "string" && note.note.trim().length > 0,
      `qualitative notes must be nonempty (${path})`
    );
    matched.push(note);
  }
  return matched;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]!;
  return sum / values.length;
}

export function runCalibrationLexicalEval(
  snapshot: CalibrationSnapshot,
  options: {
    includePilotCorpusRecallAt10Diagnostic?: boolean;
    qualitativeNotesByQuery: Record<
      string,
      { A0: QualitativeHitNote[]; A1: QualitativeHitNote[] }
    >;
    checkedAt?: string;
  }
): CalibrationLexicalEvalReport {
  const { footage, idByNumeric } = toFootage(snapshot.manifest.clips);
  const clipById: Map<string, CalibrationClip> = new Map();
  for (let i = 0; i < snapshot.manifest.clips.length; i++) {
    clipById.set(snapshot.manifest.clips[i]!.id, snapshot.manifest.clips[i]!);
  }
  const queryRows: CalibrationLexicalEvalReport["queries"] = [];
  const metricOptions = {
    includePilotCorpusRecallAt10Diagnostic:
      options.includePilotCorpusRecallAt10Diagnostic,
  };
  const qrels = snapshot.evaluationRecord.finalQrels;
  const queryById: Map<string, CalibrationQuery> = new Map();
  for (let i = 0; i < snapshot.queries.queries.length; i++) {
    queryById.set(snapshot.queries.queries[i]!.queryId, snapshot.queries.queries[i]!);
  }

  for (let q = 0; q < snapshot.queries.queries.length; q++) {
    const query = snapshot.queries.queries[q]!;
    const judgments = qrels.filter(row => row.queryId === query.queryId);
    const a0 = toHits(rankFootage(footage, query.text), idByNumeric);
    const a1 = toHits(rankFootageA1(footage, query.text), idByNumeric);
    const notes = options.qualitativeNotesByQuery[query.queryId];
    queryRows.push({
      queryId: query.queryId,
      A0: {
        ranking: a0,
        metrics: calibrationMetricsForRanking(a0.map(hit => hit.clipId), judgments, metricOptions),
        top5Notes: notesForHits(a0, notes?.A0, `${query.queryId}.A0`),
      },
      A1: {
        ranking: a1,
        metrics: calibrationMetricsForRanking(a1.map(hit => hit.clipId), judgments, metricOptions),
        top5Notes: notesForHits(a1, notes?.A1, `${query.queryId}.A1`),
      },
    });
  }

  const byIntentNdcg: CalibrationLexicalEvalReport["byIntentNdcg"] = [];
  const includeRecallDiagnostic =
    options.includePilotCorpusRecallAt10Diagnostic === true;
  for (let i = 0; i < snapshot.intents.intents.length; i++) {
    const intent = snapshot.intents.intents[i]!;
    const rows = queryRows.filter(row => {
      const query = queryById.get(row.queryId);
      return query?.intentId === intent.intentId;
    });
    const meanNdcgAt10A0 = mean(rows.map(row => row.A0.metrics.ndcgAt10));
    const meanNdcgAt10A1 = mean(rows.map(row => row.A1.metrics.ndcgAt10));
    const meanSuccessAt5A0 = mean(rows.map(row => row.A0.metrics.successAt5));
    const meanSuccessAt5A1 = mean(rows.map(row => row.A1.metrics.successAt5));
    const meanPrecisionAt5A0 = mean(
      rows.map(row => row.A0.metrics.precisionAt5)
    );
    const meanPrecisionAt5A1 = mean(
      rows.map(row => row.A1.metrics.precisionAt5)
    );
    const a1VsA0: "W" | "T" | "L" =
      meanNdcgAt10A1 > meanNdcgAt10A0
        ? "W"
        : meanNdcgAt10A1 < meanNdcgAt10A0
          ? "L"
          : "T";
    const row: CalibrationLexicalEvalReport["byIntentNdcg"][number] = {
      intentId: intent.intentId,
      meanNdcgAt10A0,
      meanNdcgAt10A1,
      meanSuccessAt5A0,
      meanSuccessAt5A1,
      successAt5A1MinusA0: meanSuccessAt5A1 - meanSuccessAt5A0,
      meanPrecisionAt5A0,
      meanPrecisionAt5A1,
      precisionAt5A1MinusA0: meanPrecisionAt5A1 - meanPrecisionAt5A0,
      a1VsA0,
    };
    if (includeRecallDiagnostic) {
      const meanPilotCorpusRecallAt10A0 = mean(
        rows.map(r => r.A0.metrics.pilotCorpusRecallAt10Diagnostic ?? 0)
      );
      const meanPilotCorpusRecallAt10A1 = mean(
        rows.map(r => r.A1.metrics.pilotCorpusRecallAt10Diagnostic ?? 0)
      );
      row.meanPilotCorpusRecallAt10A0 = meanPilotCorpusRecallAt10A0;
      row.meanPilotCorpusRecallAt10A1 = meanPilotCorpusRecallAt10A1;
      row.pilotCorpusRecallAt10A1MinusA0 =
        meanPilotCorpusRecallAt10A1 - meanPilotCorpusRecallAt10A0;
    }
    byIntentNdcg.push(row);
  }

  const initialByPair = annotationMap(snapshot.annotationsInitial.annotations);
  const repeatAnns = snapshot.annotationsRepeat.annotations;
  let exact = 0;
  let binary = 0;
  for (let i = 0; i < repeatAnns.length; i++) {
    const repeat = repeatAnns[i]!;
    const initial = initialByPair.get(pairKey(repeat.queryId, repeat.clipId))!;
    if (initial.grade === repeat.grade) exact += 1;
    if (initial.grade >= 2 === repeat.grade >= 2) binary += 1;
  }
  const comparedPairs = repeatAnns.length;

  const checkedAt =
    options.checkedAt ?? snapshot.evaluationRecord.generatedAt;
  const zeroOverlapChecks: ZeroOverlapCheckResult[] = [];
  for (let q = 0; q < snapshot.queries.queries.length; q++) {
    const query = snapshot.queries.queries[q]!;
    if (query.coverageTags.indexOf("zero-overlap") < 0) continue;
    const probeId = query.overlapProbeQueryId;
    assert(probeId, `zero-overlap query ${query.queryId} requires overlapProbeQueryId`);
    const probe = queryById.get(probeId);
    assert(probe, `missing overlap probe ${probeId}`);
    const targetIds: string[] = [];
    for (let i = 0; i < qrels.length; i++) {
      const row = qrels[i]!;
      if (row.queryId === query.queryId && row.grade >= 2) targetIds.push(row.clipId);
    }
    const targetClips: CalibrationClip[] = [];
    for (let i = 0; i < targetIds.length; i++) {
      const clip = clipById.get(targetIds[i]!);
      if (clip) targetClips.push(clip);
    }
    const row = queryRows.find(item => item.queryId === query.queryId)!;
    const targetSet: Set<string> = new Set(targetIds);
    const a0MatchedTargetIds = row.A0.ranking
      .map(hit => hit.clipId)
      .filter(id => targetSet.has(id));
    const a1MatchedTargetIds = row.A1.ranking
      .map(hit => hit.clipId)
      .filter(id => targetSet.has(id));
    const check = checkZeroOverlapV1({
      probeQueryText: probe.text,
      targetClips,
      queryId: query.queryId,
      overlapProbeQueryId: probeId,
      a0MatchedTargetIds,
      a1MatchedTargetIds,
      checkedAt,
    });
    assert(
      check.passed,
      `zero-overlap designation rejected: content overlap for ${query.queryId}`
    );
    zeroOverlapChecks.push(check);
  }

  return {
    systems: ["A0", "A1"],
    disclaimer: CALIBRATION_REPORT_DISCLAIMER,
    antiDegeneracyNote: ANTI_DEGENERACY_NOTE,
    queries: queryRows,
    byIntentNdcg,
    intraAnnotatorConsistency: {
      comparedPairs,
      exactGrade: comparedPairs === 0 ? 0 : exact / comparedPairs,
      binaryAtLeast2: comparedPairs === 0 ? 0 : binary / comparedPairs,
    },
    zeroOverlapChecks,
  };
}
