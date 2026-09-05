import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalEmbeddingText,
  CANONICAL_TEXT_VERSION,
} from "./canonicalText";
import * as canonicalText from "./canonicalText";
import {
  ANTI_DEGENERACY_NOTE,
  CALIBRATION_ARTIFACT_NAMES,
  CALIBRATION_CLIP_COUNT,
  CALIBRATION_INITIAL_LABEL_COUNT,
  CALIBRATION_INTENT_COUNT,
  CALIBRATION_QUERY_COUNT,
  CALIBRATION_REPEAT_LABEL_COUNT,
  CALIBRATION_REPEAT_PER_QUERY,
  CALIBRATION_REPORT_DISCLAIMER,
  CALIBRATION_SCHEMA_VERSION,
  COVERAGE_TAG_DIMENSIONS,
  FORBIDDEN_RAW_MEDIA_KEYS,
  SEMANTIC_V1_FIXED_LABELS,
  ZERO_OVERLAP_CHECKER_VERSION,
  ZERO_OVERLAP_STOPLIST,
  assertNoForbiddenPayload,
  checkZeroOverlapV1,
  contentTokensForZeroOverlap,
  deriveFinalQrels,
  finalQrelsSha256,
  parseCalibrationBundle,
  runCalibrationLexicalEval,
  sha256CanonicalJson,
  type CalibrationArtifactBundle,
  type CalibrationQuery,
  type QualitativeHitNote,
} from "./evalCalibration";
import { rankFootageA1 } from "./evalLexical";
import type { RelevanceGrade } from "./evalGold";
import { metadataV2ToLegacy, rankFootage, type ClipMetadataV2 } from "./footage";

function sha256Utf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Mixed/odd casing for forbidden-key bypass regressions (not a production helper). */
function oddlyCasedKey(key: string): string {
  return key
    .split("")
    .map((ch, index) =>
      index % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()
    )
    .join("");
}

function requireCanonicalEmbeddingContentValues(): (
  metadata: ClipMetadataV2
) => string[] {
  const fn = (
    canonicalText as {
      canonicalEmbeddingContentValues?: (metadata: ClipMetadataV2) => string[];
    }
  ).canonicalEmbeddingContentValues;
  expect(typeof fn).toBe("function");
  return fn!;
}

/**
 * Clearly labeled NON-QUALITY in-memory Solo-MVP calibration scaffolding only.
 * Structural contract fixture — never a retrieval-quality benchmark corpus.
 */
const SNAPSHOT_ID = "nq-cal-scaffold-snapshot";
const AUTHOR_REF = "author-opaque-001";
const RANDOMIZATION_METHOD = "fisher-yates-salted";
const RANDOMIZATION_VERSION = "m5-calibration-permute-v1";

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

const FORBIDDEN_QUALITY_CLAIM_PATTERNS = [
  /semantic lift/i,
  /provider superior/i,
  /multilingual[- ]ready/i,
  /production[- ]ready/i,
  /representative/i,
  /generalized quality/i,
  /m5 go\/no-go/i,
  /inter-annotator/i,
  /adjudicat/i,
] as const;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function shaHexFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  }
  const base = hash.toString(16).padStart(8, "0");
  return (base.repeat(8) + "abcdef0123456789".repeat(2)).slice(0, 64);
}

function scaffoldMetadata(seed: string, uniqueToken: string): ClipMetadataV2 {
  return {
    description: `Non-quality scaffold clip ${seed} featuring ${uniqueToken}`,
    observed: {
      visibleFacts: [`fact-${seed}`, uniqueToken],
      subjects: [`subject-${seed}`],
      actions: [`walking-${seed}`],
      setting: `setting-${seed}`,
      weather: [],
      environmentType: "outdoor",
      socialContext: "alone",
      activityLevel: "low activity",
      visualDensity: "sparse",
      spatialRelationships: [`frame-${seed}`],
      time: "daytime",
      lighting: ["soft"],
      colors: ["teal"],
      shotType: "wide",
      cameraMotion: "likely static",
    },
    interpretation: {
      mood: ["calm"],
      atmosphere: ["open"],
      sceneInterpretation: `scaffold interpretation ${seed}`,
      uncertainty: ["non-quality scaffold only"],
    },
    creative: {
      editingUses: ["transition"],
    },
  };
}

function permuteExact<T>(items: T[], salt: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = (salt + i * 17) % (i + 1);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Clearly labeled NON-QUALITY in-memory Solo-MVP calibration scaffold.
 * Structural only — never a retrieval-quality benchmark corpus.
 */
function buildNonQualityCalibrationScaffold(): CalibrationArtifactBundle {
  const blind = {
    blindToCanonicalText: true as const,
    blindToSearchDocuments: true as const,
    blindToSynonymExpansion: true as const,
    blindToSystemIdentities: true as const,
    blindToRankings: true as const,
    blindToScores: true as const,
    blindToResultSets: true as const,
  };
  const hidden = {
    hideMetadataV2: true as const,
    hideCanonicalText: true as const,
    hideSearchDocuments: true as const,
    hideSynonymExpansion: true as const,
    hideSystemIdentity: true as const,
    hideRankings: true as const,
    hideScores: true as const,
    hideResultSets: true as const,
    hideProvenanceAndLicense: true as const,
    hidePriorLabels: true as const,
  };

  const clips = Array.from({ length: CALIBRATION_CLIP_COUNT }, (_, index) => {
    const n = index + 1;
    const id = `nq-clip-${pad2(n)}`;
    const familyId =
      n <= 3 ? "nq-family-a" : n <= 6 ? "nq-family-b" : `nq-family-solo-${n}`;
    const uniqueToken = `uniquetoken${pad2(n)}xyz`;
    return {
      id,
      sourceRef: `calibration-local/nq/${id}.mp4`,
      license: {
        id: "cc0-scaffold",
        evidenceRef: "license-evidence/nq-cc0.txt",
      },
      provenance: "non-quality-in-memory-scaffold",
      rawMediaSha256: shaHexFromSeed(id),
      familyId,
      corpusCoverageTags: ["scaffold"],
      retrievalUnit: { startMs: 0, endMs: 4000, durationMs: 4000 },
      metadataV2Version: "v2",
      canonicalTextVersion: CANONICAL_TEXT_VERSION,
      metadataV2: scaffoldMetadata(id, uniqueToken),
    };
  });
  const clipIds = clips.map(clip => clip.id);

  const intents = [
    {
      intentId: "nq-intent-01",
      title: "Quiet teal wide",
      creatorScenario: "Find calm teal wides",
      taskBackstory: "Scaffold translation pair 1",
      acceptableAmbiguity: "teal vs blue-green",
      must: ["teal", "wide"],
      should: ["calm"],
      exclusions: ["crowd"],
      coverageTags: ["factual-observed", "scene"] as const,
      translationEquivalent: true,
      missingConstraint: null,
    },
    {
      intentId: "nq-intent-02",
      title: "Walking action",
      creatorScenario: "Find walking clips",
      taskBackstory: "Scaffold translation pair 2",
      acceptableAmbiguity: "walk vs stroll",
      must: ["walking"],
      should: ["outdoor"],
      exclusions: ["crowd"],
      coverageTags: ["action", "synonym-paraphrase"] as const,
      translationEquivalent: true,
      missingConstraint: null,
    },
    {
      intentId: "nq-intent-03",
      title: "Composition isolation",
      creatorScenario: "Isolated subject framing",
      taskBackstory: "Scaffold translation pair 3",
      acceptableAmbiguity: "alone vs sparse",
      must: ["alone"],
      should: ["wide"],
      exclusions: ["crowd"],
      coverageTags: ["composition-relationship"] as const,
      translationEquivalent: true,
      missingConstraint: null,
    },
    {
      intentId: "nq-intent-04",
      title: "Zero overlap mood",
      creatorScenario: "Mood without lexical overlap",
      taskBackstory: "Scaffold translation pair 4",
      acceptableAmbiguity: "reflective vs quiet",
      must: ["reflective"],
      should: ["memory"],
      exclusions: ["party"],
      coverageTags: ["zero-overlap"] as const,
      translationEquivalent: true,
      missingConstraint: null,
    },
    {
      intentId: "nq-intent-05",
      title: "Natural zh singleton",
      creatorScenario: "Natural Chinese request",
      taskBackstory: "Scaffold natural zh",
      acceptableAmbiguity: "open outdoor",
      must: ["outdoor"],
      should: ["daytime"],
      exclusions: ["nightclub"],
      coverageTags: ["scene"] as const,
      translationEquivalent: false,
      missingConstraint: null,
    },
    {
      intentId: "nq-intent-06",
      title: "Hard negative missing constraint",
      creatorScenario: "Almost match but missing rain",
      taskBackstory: "Scaffold hard negative",
      acceptableAmbiguity: "none",
      must: ["rain"],
      should: ["street"],
      exclusions: ["sunny-only"],
      coverageTags: ["missing-constraint"] as const,
      translationEquivalent: false,
      missingConstraint: "visible rain required",
    },
  ];

  const queries: CalibrationQuery[] = [
    {
      queryId: "nq-q-01-en",
      intentId: "nq-intent-01",
      text: "quiet teal wide outdoor clips",
      queryLanguage: "en",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "same-language",
      variantKind: "translation-en",
      translationPairId: "nq-pair-01",
      coverageTags: ["factual-observed", "scene"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:00:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
    {
      queryId: "nq-q-01-zh",
      intentId: "nq-intent-01",
      text: "安静的青绿色广角户外镜头",
      queryLanguage: "zh",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "cross-lingual",
      variantKind: "translation-zh",
      translationPairId: "nq-pair-01",
      coverageTags: ["factual-observed", "scene"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:01:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
    {
      queryId: "nq-q-02-en",
      intentId: "nq-intent-02",
      text: "someone walking outdoors",
      queryLanguage: "en",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "same-language",
      variantKind: "translation-en",
      translationPairId: "nq-pair-02",
      coverageTags: ["action", "synonym-paraphrase"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:02:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
    {
      queryId: "nq-q-02-zh",
      intentId: "nq-intent-02",
      text: "有人在户外走路",
      queryLanguage: "zh",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "cross-lingual",
      variantKind: "translation-zh",
      translationPairId: "nq-pair-02",
      coverageTags: ["action", "synonym-paraphrase"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:03:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
    {
      queryId: "nq-q-03-en",
      intentId: "nq-intent-03",
      text: "isolated subject in a wide frame",
      queryLanguage: "en",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "same-language",
      variantKind: "translation-en",
      translationPairId: "nq-pair-03",
      coverageTags: ["composition-relationship"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:04:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
    {
      queryId: "nq-q-03-zh",
      intentId: "nq-intent-03",
      text: "广角构图中孤立的人物",
      queryLanguage: "zh",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "cross-lingual",
      variantKind: "translation-zh",
      translationPairId: "nq-pair-03",
      coverageTags: ["composition-relationship"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:05:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
    {
      queryId: "nq-q-04-en",
      intentId: "nq-intent-04",
      text: "wistful remembrance hush",
      queryLanguage: "en",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "same-language",
      variantKind: "translation-en",
      translationPairId: "nq-pair-04",
      coverageTags: ["zero-overlap"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:06:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: "nq-q-04-en",
    },
    {
      queryId: "nq-q-04-zh",
      intentId: "nq-intent-04",
      text: "带着惆怅回忆的安静感",
      queryLanguage: "zh",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "cross-lingual",
      variantKind: "translation-zh",
      translationPairId: "nq-pair-04",
      coverageTags: ["zero-overlap"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:07:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: "nq-q-04-en",
    },
    {
      queryId: "nq-q-05-zh",
      intentId: "nq-intent-05",
      text: "白天户外开阔的镜头",
      queryLanguage: "zh",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "cross-lingual",
      variantKind: "natural-zh",
      translationPairId: null,
      coverageTags: ["scene"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:08:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
    {
      queryId: "nq-q-06-en",
      intentId: "nq-intent-06",
      text: "rainy street without umbrellas",
      queryLanguage: "en",
      searchableMetadataEvidenceLanguage: "en",
      languageRelation: "same-language",
      variantKind: "hard-negative-en",
      translationPairId: null,
      coverageTags: ["missing-constraint"],
      authorRef: AUTHOR_REF,
      authorRole: "query-author",
      authoredAt: "2026-02-01T10:09:00.000Z",
      blindAuthorshipDeclaration: blind,
      overlapProbeQueryId: null,
    },
  ];

  const primaryByQuery: Record<string, string> = {
    "nq-q-01-en": "nq-clip-01",
    "nq-q-01-zh": "nq-clip-01",
    "nq-q-02-en": "nq-clip-02",
    "nq-q-02-zh": "nq-clip-02",
    "nq-q-03-en": "nq-clip-03",
    "nq-q-03-zh": "nq-clip-03",
    "nq-q-04-en": "nq-clip-04",
    "nq-q-04-zh": "nq-clip-04",
    "nq-q-05-zh": "nq-clip-05",
    "nq-q-06-en": "nq-clip-07",
  };

  function gradeFor(queryId: string, clipId: string): RelevanceGrade {
    if (primaryByQuery[queryId] === clipId) return 3;
    if (clipId === "nq-clip-08") return 1;
    if (clipId === "nq-clip-09") return 2;
    return 0;
  }

  const initialAnnotations = [];
  for (const query of queries) {
    for (const clipId of clipIds) {
      const grade = gradeFor(query.queryId, clipId);
      initialAnnotations.push({
        queryId: query.queryId,
        clipId,
        fullClipJudged: true as const,
        grade,
        reason:
          grade >= 2
            ? `fits MUST for ${query.queryId}`
            : `nonfit for ${query.queryId}`,
        evidence:
          grade >= 2
            ? [{ timestampMs: 1000, note: "visible support in unit" }]
            : [],
        nonfitReason: grade >= 2 ? null : "does not satisfy MUST",
      });
    }
  }

  const repeatPairs: Array<{ queryId: string; clipId: string }> = [];
  for (const query of queries) {
    const primary = primaryByQuery[query.queryId]!;
    const picks = [
      primary,
      "nq-clip-08",
      "nq-clip-09",
      "nq-clip-10",
      "nq-clip-11",
      "nq-clip-12",
    ];
    for (const clipId of picks) {
      repeatPairs.push({ queryId: query.queryId, clipId });
    }
  }

  const repeatAnnotations = repeatPairs.map((pair, index) => {
    const initial = initialAnnotations.find(
      item => item.queryId === pair.queryId && item.clipId === pair.clipId
    )!;
    const disagree =
      pair.clipId === "nq-clip-08" &&
      (pair.queryId === "nq-q-01-en" || pair.queryId === "nq-q-06-en");
    const grade = (
      disagree ? (initial.grade === 1 ? 2 : 1) : initial.grade
    ) as RelevanceGrade;
    return {
      queryId: pair.queryId,
      clipId: pair.clipId,
      fullClipJudged: true as const,
      grade,
      reason: `repeat reason ${index}`,
      evidence:
        grade >= 2 ? [{ timestampMs: 1500, note: "repeat evidence" }] : [],
      nonfitReason: grade >= 2 ? null : "repeat nonfit",
    };
  });

  const selfResolutions = repeatAnnotations.flatMap(repeat => {
    const initial = initialAnnotations.find(
      item => item.queryId === repeat.queryId && item.clipId === repeat.clipId
    )!;
    if (initial.grade === repeat.grade) return [];
    return [
      {
        queryId: repeat.queryId,
        clipId: repeat.clipId,
        initialGrade: initial.grade,
        repeatGrade: repeat.grade,
        finalGrade: initial.grade,
        resolutionReason: "kept initial after review",
        resolvedAt: "2026-02-10T12:00:00.000Z",
      },
    ];
  });

  const presentationInitial = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    generatedAt: "2026-02-02T00:00:00.000Z",
    judgingMode: "full-clip" as const,
    fullClipPlaybackRequired: true as const,
    randomizationMethod: RANDOMIZATION_METHOD,
    randomizationVersion: RANDOMIZATION_VERSION,
    hidden,
    presentations: queries.map((query, index) => ({
      queryId: query.queryId,
      clipOrder: permuteExact(clipIds, index + 3),
    })),
  };

  const presentationRepeat = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    generatedAt: "2026-02-08T00:00:00.000Z",
    judgingMode: "full-clip" as const,
    fullClipPlaybackRequired: true as const,
    randomizationMethod: RANDOMIZATION_METHOD,
    randomizationVersion: RANDOMIZATION_VERSION,
    hidden: { ...hidden, hideInitialOrderAndGrade: true as const },
    presentations: queries.map((query, index) => ({
      queryId: query.queryId,
      clipOrder: permuteExact(
        repeatPairs
          .filter(pair => pair.queryId === query.queryId)
          .map(pair => pair.clipId),
        index + 9
      ),
    })),
  };

  const annotationsInitial = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    startedAt: "2026-02-02T01:00:00.000Z",
    completedAt: "2026-02-05T00:00:00.000Z",
    annotations: initialAnnotations,
  };

  const annotationsRepeat = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    startedAt: "2026-02-08T01:00:00.000Z",
    completedAt: "2026-02-09T00:00:00.000Z",
    annotations: repeatAnnotations,
  };

  const washoutStartedAt = "2026-02-06T00:00:00.000Z";
  const washoutEndedAt = "2026-02-07T00:00:00.000Z";
  const repeatSubset = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    frozenAt: "2026-02-06T00:00:00.000Z",
    washoutStartedAt,
    washoutEndedAt,
    washoutIntervalMs:
      Date.parse(washoutEndedAt) - Date.parse(washoutStartedAt),
    selectionMethod: "stratified-scaffold",
    strata: ["language", "variantKind", "coverageTags", "grade", "family"],
    pairs: repeatPairs,
  };

  const selfResolutionsFile = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    startedAt: "2026-02-10T00:00:00.000Z",
    completedAt: "2026-02-10T18:00:00.000Z",
    resolutions: selfResolutions,
  };

  const finalQrels = deriveFinalQrels(
    annotationsInitial,
    selfResolutionsFile
  );

  const evaluationRecord = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    generatedAt: "2026-02-11T00:00:00.000Z",
    finalQrels,
    finalQrelsSha256: finalQrelsSha256(finalQrels),
  };

  const manifest = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    manifestVersion: "nq-cal-scaffold-manifest-v1",
    purpose: "calibration-only" as const,
    snapshotFrozenAt: "2026-02-01T12:00:00.000Z",
    clips,
  };
  const intentsFile = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    intents: intents.map(intent => ({
      ...intent,
      coverageTags: [...intent.coverageTags],
    })),
  };
  const queriesFile = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    queries,
  };

  const partialBundle = {
    "manifest.json": manifest,
    "intents.json": intentsFile,
    "queries.json": queriesFile,
    "presentation.initial.json": presentationInitial,
    "annotations.initial.json": annotationsInitial,
    "repeat-subset.json": repeatSubset,
    "presentation.repeat.json": presentationRepeat,
    "annotations.repeat.json": annotationsRepeat,
    "self-resolutions.json": selfResolutionsFile,
    "evaluation-record.json": evaluationRecord,
  };

  const sha256ByArtifact = Object.fromEntries(
    CALIBRATION_ARTIFACT_NAMES.filter(
      name => name !== "snapshot-index.json"
    ).map(name => [
      name,
      sha256CanonicalJson(partialBundle[name as keyof typeof partialBundle]),
    ])
  );

  return {
    ...partialBundle,
    "snapshot-index.json": {
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      snapshotId: SNAPSHOT_ID,
      generatedAt: "2026-02-11T01:00:00.000Z",
      sha256ByArtifact,
    },
  } as CalibrationArtifactBundle;
}

function notesForRanking(
  ranking: Array<{ clipId: string }>
): QualitativeHitNote[] {
  return ranking.slice(0, 5).map((hit, index) => ({
    clipId: hit.clipId,
    rank: index + 1,
    note: `MUST/SHOULD/exclusion review for ${hit.clipId}; lexical match/surprise noted.`,
  }));
}

function qualitativeNotesForSnapshot(
  snapshot: ReturnType<typeof parseCalibrationBundle>
): Record<string, { A0: QualitativeHitNote[]; A1: QualitativeHitNote[] }> {
  const footageClips = snapshot.manifest.clips.map((clip, index) => ({
    id: index + 1,
    projectIds: [],
    fileName: `${clip.id}.mov`,
    durationMs: clip.retrievalUnit.durationMs,
    thumbnailUrl: null,
    mediaUrl: null,
    status: "ready" as const,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...metadataV2ToLegacy(clip.metadataV2),
    metadataJson: clip.metadataV2,
  }));
  const idByNumeric = new Map(
    snapshot.manifest.clips.map((clip, index) => [index + 1, clip.id] as const)
  );
  const qualitativeNotesByQuery: Record<
    string,
    { A0: QualitativeHitNote[]; A1: QualitativeHitNote[] }
  > = {};
  for (const query of snapshot.queries.queries) {
    const a0 = rankFootage(footageClips, query.text)
      .filter(item => item.score > 0)
      .map(item => ({
        clipId: idByNumeric.get(item.clip.id) ?? String(item.clip.id),
      }));
    const a1 = rankFootageA1(footageClips, query.text)
      .filter(item => item.score > 0)
      .map(item => ({
        clipId: idByNumeric.get(item.clip.id) ?? String(item.clip.id),
      }));
    qualitativeNotesByQuery[query.queryId] = {
      A0: notesForRanking(a0),
      A1: notesForRanking(a1),
    };
  }
  return qualitativeNotesByQuery;
}

function rebuildSnapshotIndex(
  bundle: CalibrationArtifactBundle
): CalibrationArtifactBundle {
  const sha256ByArtifact = Object.fromEntries(
    CALIBRATION_ARTIFACT_NAMES.filter(
      name => name !== "snapshot-index.json"
    ).map(name => [name, sha256CanonicalJson(bundle[name])])
  );
  return {
    ...bundle,
    "snapshot-index.json": {
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      snapshotId: SNAPSHOT_ID,
      generatedAt: "2026-02-11T01:00:00.000Z",
      sha256ByArtifact,
    },
  };
}

describe("calibration contract constants (wished-for)", () => {
  it("locks exact 24/10/6/240/60 counts and seven coverage dimensions", () => {
    expect(CALIBRATION_CLIP_COUNT).toBe(24);
    expect(CALIBRATION_QUERY_COUNT).toBe(10);
    expect(CALIBRATION_INTENT_COUNT).toBe(6);
    expect(CALIBRATION_INITIAL_LABEL_COUNT).toBe(240);
    expect(CALIBRATION_REPEAT_LABEL_COUNT).toBe(60);
    expect(CALIBRATION_REPEAT_PER_QUERY).toBe(6);
    expect(CALIBRATION_SCHEMA_VERSION).toBe("m5-calibration-solo-v1");
    expect([...COVERAGE_TAG_DIMENSIONS]).toEqual([
      "factual-observed",
      "action",
      "scene",
      "composition-relationship",
      "synonym-paraphrase",
      "zero-overlap",
      "missing-constraint",
    ]);
    expect(ZERO_OVERLAP_CHECKER_VERSION).toBe("zero-overlap-v1");
  });
});

describe("calibration artifact/contract validation", () => {
  it("parses a clearly labeled non-quality in-memory scaffold with immutable counts", () => {
    const bundle = buildNonQualityCalibrationScaffold();
    const snapshot = parseCalibrationBundle(bundle);
    expect(snapshot.schemaVersion).toBe(CALIBRATION_SCHEMA_VERSION);
    expect(snapshot.manifest.clips).toHaveLength(CALIBRATION_CLIP_COUNT);
    expect(snapshot.queries.queries).toHaveLength(CALIBRATION_QUERY_COUNT);
    expect(snapshot.intents.intents).toHaveLength(CALIBRATION_INTENT_COUNT);
    expect(snapshot.annotationsInitial.annotations).toHaveLength(
      CALIBRATION_INITIAL_LABEL_COUNT
    );
    expect(snapshot.annotationsRepeat.annotations).toHaveLength(
      CALIBRATION_REPEAT_LABEL_COUNT
    );
    expect(snapshot.repeatSubset.pairs).toHaveLength(
      CALIBRATION_REPEAT_LABEL_COUNT
    );
    for (const query of snapshot.queries.queries) {
      const pairs = snapshot.repeatSubset.pairs.filter(
        pair => pair.queryId === query.queryId
      );
      expect(pairs).toHaveLength(CALIBRATION_REPEAT_PER_QUERY);
    }
  });

  it("requires nonempty manifestVersion and purpose exactly calibration-only", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    expect(snapshot.manifest).toEqual(
      expect.objectContaining({
        manifestVersion: expect.stringMatching(/\S/),
        purpose: "calibration-only",
      })
    );

    const missingVersion = buildNonQualityCalibrationScaffold();
    delete (missingVersion["manifest.json"] as { manifestVersion?: string })
      .manifestVersion;
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(missingVersion))
    ).toThrow(/manifestVersion/i);

    const emptyVersion = buildNonQualityCalibrationScaffold();
    (emptyVersion["manifest.json"] as { manifestVersion: string }).manifestVersion =
      "   ";
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(emptyVersion))
    ).toThrow(/manifestVersion/i);

    const badPurpose = buildNonQualityCalibrationScaffold();
    (badPurpose["manifest.json"] as { purpose: string }).purpose =
      "benchmark-quality";
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(badPurpose))
    ).toThrow(/purpose|calibration-only/i);
  });

  it("requires four translation pairs plus natural-zh and hard-negative-en", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const queries = snapshot.queries.queries;
    const pairIds = new Set(
      queries
        .filter(
          query =>
            query.variantKind === "translation-en" ||
            query.variantKind === "translation-zh"
        )
        .map(query => query.translationPairId)
    );
    expect(pairIds.size).toBe(4);
    for (const pairId of pairIds) {
      const en = queries.find(
        query =>
          query.translationPairId === pairId &&
          query.variantKind === "translation-en"
      );
      const zh = queries.find(
        query =>
          query.translationPairId === pairId &&
          query.variantKind === "translation-zh"
      );
      expect(en).toBeDefined();
      expect(zh).toBeDefined();
      expect(en!.intentId).toBe(zh!.intentId);
    }
    expect(
      queries.filter(query => query.variantKind === "natural-zh")
    ).toHaveLength(1);
    expect(
      queries.filter(query => query.variantKind === "hard-negative-en")
    ).toHaveLength(1);
    const hard = queries.find(
      query => query.variantKind === "hard-negative-en"
    )!;
    const hardIntent = snapshot.intents.intents.find(
      intent => intent.intentId === hard.intentId
    )!;
    expect(hardIntent.missingConstraint).toMatch(/\S/);
  });

  it("maps four translation pairs and two singletons to six independent intents", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const queries = snapshot.queries.queries;
    const intentById = new Map(
      snapshot.intents.intents.map(intent => [intent.intentId, intent])
    );
    const queriedIntentIds = [...new Set(queries.map(query => query.intentId))];
    expect(queriedIntentIds).toHaveLength(6);

    const translationPairs = new Set(
      queries
        .filter(query => query.variantKind === "translation-en")
        .map(query => query.translationPairId)
    );
    expect(translationPairs.size).toBe(4);
    const translationIntentIds = new Set<string>();
    for (const pairId of translationPairs) {
      const en = queries.find(
        query =>
          query.translationPairId === pairId &&
          query.variantKind === "translation-en"
      )!;
      const zh = queries.find(
        query =>
          query.translationPairId === pairId &&
          query.variantKind === "translation-zh"
      )!;
      expect(en.intentId).toBe(zh.intentId);
      translationIntentIds.add(en.intentId);
      expect(intentById.get(en.intentId)!.translationEquivalent).toBe(true);
    }
    expect(translationIntentIds.size).toBe(4);

    const naturalZh = queries.find(query => query.variantKind === "natural-zh")!;
    const hardNeg = queries.find(
      query => query.variantKind === "hard-negative-en"
    )!;
    expect(naturalZh.intentId).not.toBe(hardNeg.intentId);
    expect(intentById.get(naturalZh.intentId)!.translationEquivalent).toBe(
      false
    );
    expect(intentById.get(hardNeg.intentId)!.translationEquivalent).toBe(false);
    expect(translationIntentIds.has(naturalZh.intentId)).toBe(false);
    expect(translationIntentIds.has(hardNeg.intentId)).toBe(false);
  });

  it("rejects collapsed translation-pair intents or translationEquivalent mismatches", () => {
    const collapsed = buildNonQualityCalibrationScaffold();
    const collapsedQueries = collapsed["queries.json"] as {
      queries: Array<{ queryId: string; intentId: string }>;
    };
    for (const query of collapsedQueries.queries) {
      if (query.queryId === "nq-q-02-en" || query.queryId === "nq-q-02-zh") {
        query.intentId = "nq-intent-01";
      }
    }
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(collapsed))
    ).toThrow(/intent|translation|independent/i);

    const mismatched = buildNonQualityCalibrationScaffold();
    const intents = mismatched["intents.json"] as {
      intents: Array<{ intentId: string; translationEquivalent: boolean }>;
    };
    const pairIntent = intents.intents.find(
      intent => intent.intentId === "nq-intent-01"
    )!;
    pairIntent.translationEquivalent = false;
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(mismatched))
    ).toThrow(/translationEquivalent/i);

    const singletonMismatch = buildNonQualityCalibrationScaffold();
    const singletonIntents = singletonMismatch["intents.json"] as {
      intents: Array<{ intentId: string; translationEquivalent: boolean }>;
    };
    const naturalIntent = singletonIntents.intents.find(
      intent => intent.intentId === "nq-intent-05"
    )!;
    naturalIntent.translationEquivalent = true;
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(singletonMismatch))
    ).toThrow(/translationEquivalent/i);
  });

  it("requires nonempty intent authoring fields and MUST/SHOULD/exclusions", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    for (const intent of snapshot.intents.intents) {
      expect(intent.creatorScenario.trim().length).toBeGreaterThan(0);
      expect(intent.taskBackstory.trim().length).toBeGreaterThan(0);
      expect(intent.acceptableAmbiguity.trim().length).toBeGreaterThan(0);
      expect(intent.must.length).toBeGreaterThan(0);
      expect(intent.should.length).toBeGreaterThan(0);
      expect(intent.exclusions.length).toBeGreaterThan(0);
    }

    const bundle = buildNonQualityCalibrationScaffold();
    const intents = bundle["intents.json"] as {
      intents: Array<{ must: string[] }>;
    };
    intents.intents[0]!.must = [];
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle))).toThrow(
      /must/i
    );
  });

  it("requires opaque authorship fields and every author-blindness flag", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    for (const query of snapshot.queries.queries) {
      expect(query.authorRef).toMatch(/\S/);
      expect(query.authorRef).not.toMatch(/@|mailto:/i);
      expect(query.authorRole).toMatch(/\S/);
      expect(query.authoredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      for (const flag of AUTHOR_BLIND_FLAGS) {
        expect(query.blindAuthorshipDeclaration[flag]).toBe(true);
      }
    }

    const bundle = buildNonQualityCalibrationScaffold();
    const queries = bundle["queries.json"] as {
      queries: Array<{
        blindAuthorshipDeclaration: Record<string, boolean>;
      }>;
    };
    queries.queries[0]!.blindAuthorshipDeclaration.blindToRankings = false;
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle))).toThrow(
      /blind/i
    );
  });

  it("keeps English evidence language and languageRelation distinct from translation pairing", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    for (const query of snapshot.queries.queries) {
      expect(query.searchableMetadataEvidenceLanguage).toBe("en");
      if (query.queryLanguage === "en") {
        expect(query.languageRelation).toBe("same-language");
      } else {
        expect(query.languageRelation).toBe("cross-lingual");
      }
    }
    const pairedZh = snapshot.queries.queries.find(
      query => query.queryId === "nq-q-01-zh"
    )!;
    expect(pairedZh.translationPairId).toBe("nq-pair-01");
    expect(pairedZh.languageRelation).toBe("cross-lingual");
    const naturalZh = snapshot.queries.queries.find(
      query => query.variantKind === "natural-zh"
    )!;
    expect(naturalZh.translationPairId).toBeNull();
    expect(naturalZh.languageRelation).toBe("cross-lingual");
  });

  it("requires coverage union across seven separate dimensions", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const union = new Set(
      snapshot.queries.queries.flatMap(query => query.coverageTags)
    );
    for (const dimension of COVERAGE_TAG_DIMENSIONS) {
      expect(union.has(dimension)).toBe(true);
    }
  });

  it("requires full-clip judging, all hidden flags, randomizationMethod/version, and exact permutations", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    for (const presentation of [
      snapshot.presentationInitial,
      snapshot.presentationRepeat,
    ]) {
      expect(presentation.judgingMode).toBe("full-clip");
      expect(presentation.fullClipPlaybackRequired).toBe(true);
      expect(presentation.randomizationMethod).toBe(RANDOMIZATION_METHOD);
      expect(presentation.randomizationVersion).toBe(RANDOMIZATION_VERSION);
      for (const flag of HIDDEN_FLAGS) {
        expect(presentation.hidden[flag]).toBe(true);
      }
    }
    expect(
      snapshot.presentationRepeat.hidden.hideInitialOrderAndGrade
    ).toBe(true);

    for (const annotation of snapshot.annotationsInitial.annotations) {
      expect(annotation.fullClipJudged).toBe(true);
    }
    for (const annotation of snapshot.annotationsRepeat.annotations) {
      expect(annotation.fullClipJudged).toBe(true);
    }

    const clipIds = snapshot.manifest.clips.map(clip => clip.id);
    for (const [index, query] of snapshot.queries.queries.entries()) {
      const row = snapshot.presentationInitial.presentations.find(
        item => item.queryId === query.queryId
      )!;
      expect(row.clipOrder).toEqual(permuteExact(clipIds, index + 3));
      expect(new Set(row.clipOrder).size).toBe(clipIds.length);
    }
  });

  it("enforces retrieval-unit bounds and evidence timestamps within the unit", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    for (const clip of snapshot.manifest.clips) {
      const unit = clip.retrievalUnit;
      expect(unit.startMs).toBeGreaterThanOrEqual(0);
      expect(unit.startMs).toBeLessThan(unit.endMs);
      expect(unit.durationMs).toBe(unit.endMs - unit.startMs);
    }
    for (const annotation of snapshot.annotationsInitial.annotations) {
      for (const evidence of annotation.evidence) {
        const clip = snapshot.manifest.clips.find(
          item => item.id === annotation.clipId
        )!;
        expect(evidence.timestampMs).toBeGreaterThanOrEqual(0);
        expect(evidence.timestampMs).toBeLessThanOrEqual(
          clip.retrievalUnit.durationMs
        );
      }
    }

    const bundle = buildNonQualityCalibrationScaffold();
    const manifest = bundle["manifest.json"] as {
      clips: Array<{ retrievalUnit: { startMs: number; endMs: number; durationMs: number } }>;
    };
    manifest.clips[0]!.retrievalUnit = {
      startMs: 10,
      endMs: 5,
      durationMs: -5,
    };
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle))).toThrow(
      /retrievalUnit|startMs|endMs|durationMs/i
    );
  });

  it("requires strictly positive washout and lifecycle ordering", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    expect(snapshot.repeatSubset.washoutIntervalMs).toBeGreaterThan(0);

    const authoredMax = Math.max(
      ...snapshot.queries.queries.map(query => Date.parse(query.authoredAt))
    );
    const frozen = Date.parse(snapshot.manifest.snapshotFrozenAt);
    const initialGen = Date.parse(snapshot.presentationInitial.generatedAt);
    const initialStart = Date.parse(snapshot.annotationsInitial.startedAt);
    const initialDone = Date.parse(snapshot.annotationsInitial.completedAt);
    const subsetFrozen = Date.parse(snapshot.repeatSubset.frozenAt);
    const repeatGen = Date.parse(snapshot.presentationRepeat.generatedAt);
    const repeatStart = Date.parse(snapshot.annotationsRepeat.startedAt);
    const repeatDone = Date.parse(snapshot.annotationsRepeat.completedAt);
    const resolveStart = Date.parse(snapshot.selfResolutions.startedAt);
    const resolveDone = Date.parse(snapshot.selfResolutions.completedAt);
    const evalGen = Date.parse(snapshot.evaluationRecord.generatedAt);
    const indexGen = Date.parse(snapshot.snapshotIndex.generatedAt);

    expect(authoredMax).toBeLessThanOrEqual(initialGen);
    expect(frozen).toBeLessThanOrEqual(initialGen);
    expect(initialGen).toBeLessThanOrEqual(initialStart);
    expect(initialStart).toBeLessThanOrEqual(initialDone);
    expect(initialDone).toBeLessThanOrEqual(subsetFrozen);
    expect(subsetFrozen).toBeLessThanOrEqual(repeatGen);
    expect(repeatGen).toBeLessThan(repeatStart);
    expect(repeatStart).toBeLessThanOrEqual(repeatDone);
    expect(repeatDone).toBeLessThanOrEqual(resolveStart);
    expect(resolveStart).toBeLessThanOrEqual(resolveDone);
    expect(resolveDone).toBeLessThanOrEqual(evalGen);
    expect(evalGen).toBeLessThanOrEqual(indexGen);

    const bundle = buildNonQualityCalibrationScaffold();
    const subset = bundle["repeat-subset.json"] as {
      washoutIntervalMs: number;
    };
    subset.washoutIntervalMs = 0;
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle))).toThrow(
      /washout/i
    );
  });

  it("records washoutStartedAt/EndedAt provenance and exact interval equality", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const subset = snapshot.repeatSubset as {
      washoutStartedAt: string;
      washoutEndedAt: string;
      washoutIntervalMs: number;
    };
    expect(subset.washoutStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(subset.washoutEndedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const start = Date.parse(subset.washoutStartedAt);
    const end = Date.parse(subset.washoutEndedAt);
    expect(start).toBeGreaterThanOrEqual(
      Date.parse(snapshot.annotationsInitial.completedAt)
    );
    expect(end).toBeLessThanOrEqual(
      Date.parse(snapshot.presentationRepeat.generatedAt)
    );
    expect(end).toBeGreaterThan(start);
    expect(subset.washoutIntervalMs).toBe(end - start);

    const beforeInitialDone = buildNonQualityCalibrationScaffold();
    (
      beforeInitialDone["repeat-subset.json"] as { washoutStartedAt: string }
    ).washoutStartedAt = "2026-02-04T00:00:00.000Z";
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(beforeInitialDone))
    ).toThrow(/washoutStartedAt|washout/i);

    // Washout after initial completion but before repeat-subset freeze.
    // Interval/end stay consistent so existing checks would pass; rejection must
    // come from subset-freeze <= washoutStartedAt (approved: freeze then washout).
    const washoutBeforeSubsetFreeze = buildNonQualityCalibrationScaffold();
    const earlyWashout = washoutBeforeSubsetFreeze["repeat-subset.json"] as {
      washoutStartedAt: string;
      washoutEndedAt: string;
      washoutIntervalMs: number;
    };
    earlyWashout.washoutStartedAt = "2026-02-05T12:00:00.000Z";
    earlyWashout.washoutEndedAt = "2026-02-07T00:00:00.000Z";
    earlyWashout.washoutIntervalMs =
      Date.parse(earlyWashout.washoutEndedAt) -
      Date.parse(earlyWashout.washoutStartedAt);
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(washoutBeforeSubsetFreeze))
    ).toThrow(/frozenAt|washoutStartedAt|subset|freeze|washout/i);

    const afterRepeatPresentation = buildNonQualityCalibrationScaffold();
    (
      afterRepeatPresentation["repeat-subset.json"] as {
        washoutEndedAt: string;
        washoutIntervalMs: number;
        washoutStartedAt: string;
      }
    ).washoutEndedAt = "2026-02-09T00:00:00.000Z";
    const late = afterRepeatPresentation["repeat-subset.json"] as {
      washoutStartedAt: string;
      washoutEndedAt: string;
      washoutIntervalMs: number;
    };
    late.washoutIntervalMs =
      Date.parse(late.washoutEndedAt) - Date.parse(late.washoutStartedAt);
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(afterRepeatPresentation))
    ).toThrow(/washoutEndedAt|washout/i);

    const endBeforeStart = buildNonQualityCalibrationScaffold();
    const inverted = endBeforeStart["repeat-subset.json"] as {
      washoutStartedAt: string;
      washoutEndedAt: string;
      washoutIntervalMs: number;
    };
    inverted.washoutStartedAt = "2026-02-06T00:00:00.000Z";
    inverted.washoutEndedAt = "2026-02-05T12:00:00.000Z";
    // Keep a positive declared interval so rejection must come from end>start,
    // not merely washoutIntervalMs > 0.
    inverted.washoutIntervalMs = 86_400_000;
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(endBeforeStart))
    ).toThrow(/washoutEndedAt|washoutStartedAt|washout/i);

    const intervalMismatch = buildNonQualityCalibrationScaffold();
    (
      intervalMismatch["repeat-subset.json"] as { washoutIntervalMs: number }
    ).washoutIntervalMs = 1;
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(intervalMismatch))
    ).toThrow(/washoutIntervalMs|washout/i);
  });

  it("requires max query authoredAt <= manifest snapshotFrozenAt", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const authoredMax = Math.max(
      ...snapshot.queries.queries.map(query => Date.parse(query.authoredAt))
    );
    expect(authoredMax).toBeLessThanOrEqual(
      Date.parse(snapshot.manifest.snapshotFrozenAt)
    );

    const bundle = buildNonQualityCalibrationScaffold();
    const queries = bundle["queries.json"] as {
      queries: Array<{ authoredAt: string }>;
    };
    // After freeze (12:00) but still before initial presentation (Feb 2).
    queries.queries[0]!.authoredAt = "2026-02-01T18:00:00.000Z";
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle))).toThrow(
      /authoredAt|snapshotFrozenAt|freeze/i
    );
  });

  it("requires repeat strata and self-resolutions for every-and-only disagreements", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    expect(snapshot.repeatSubset.strata).toEqual(
      expect.arrayContaining([
        "language",
        "variantKind",
        "coverageTags",
        "grade",
        "family",
      ])
    );

    const disagreeKeys = new Set<string>();
    for (const repeat of snapshot.annotationsRepeat.annotations) {
      const initial = snapshot.annotationsInitial.annotations.find(
        item =>
          item.queryId === repeat.queryId && item.clipId === repeat.clipId
      )!;
      if (initial.grade !== repeat.grade) {
        disagreeKeys.add(`${repeat.queryId}::${repeat.clipId}`);
      }
    }
    const resolutionKeys = new Set(
      snapshot.selfResolutions.resolutions.map(
        item => `${item.queryId}::${item.clipId}`
      )
    );
    expect(resolutionKeys).toEqual(disagreeKeys);
    for (const resolution of snapshot.selfResolutions.resolutions) {
      expect(resolution.resolutionReason.trim().length).toBeGreaterThan(0);
      expect(resolution.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("documents approved anti-degeneracy floor and nonrepresentative disclaimer", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const familyCounts = new Map<string, number>();
    for (const clip of snapshot.manifest.clips) {
      familyCounts.set(
        clip.familyId,
        (familyCounts.get(clip.familyId) ?? 0) + 1
      );
    }
    expect(familyCounts.size).toBeGreaterThanOrEqual(2);
    expect([...familyCounts.values()].some(count => count >= 2)).toBe(true);
    expect([...familyCounts.values()].some(count => count === 1)).toBe(true);

    expect(ANTI_DEGENERACY_NOTE.toLowerCase()).toMatch(
      /cannot support representative|generalized quality/
    );
    expect(CALIBRATION_REPORT_DISCLAIMER.toLowerCase()).toMatch(
      /not semantic lift|not.*production-ready|not.*m5 go\/no-go/
    );
  });

  it("uses one flat snapshot-index hash map and one final qrels hash only", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const artifactKeys = Object.keys(snapshot.snapshotIndex.sha256ByArtifact);
    expect(artifactKeys.sort()).toEqual(
      CALIBRATION_ARTIFACT_NAMES.filter(
        name => name !== "snapshot-index.json"
      ).slice().sort()
    );
    expect(snapshot.snapshotIndex.sha256ByArtifact).not.toHaveProperty(
      "snapshot-index.json"
    );
    for (const hash of Object.values(snapshot.snapshotIndex.sha256ByArtifact)) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof hash).toBe("string");
    }
    expect(snapshot.evaluationRecord.finalQrelsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(snapshot.evaluationRecord)).not.toMatch(
      /evidenceHash|nested.*hash|dependencyGraph/i
    );
    expect(JSON.stringify(snapshot.snapshotIndex)).not.toMatch(
      /dependencyGraph|nestedHashes/
    );
  });

  it("rejects forbidden keys/paths/query-bearing URLs/demo/synthetic and raw-media-like values", () => {
    expect(() =>
      assertNoForbiddenPayload({ clip: { mediaPath: "x" } })
    ).toThrow(/forbidden key mediaPath/);
    expect(() =>
      assertNoForbiddenPayload({ clip: { storageKey: "k" } })
    ).toThrow(/forbidden key storageKey/);
    expect(() =>
      assertNoForbiddenPayload({ clip: { apiKey: "secret" } })
    ).toThrow(/forbidden key apiKey/);
    expect(() =>
      assertNoForbiddenPayload({ ref: "/absolute/path/clip.mp4" })
    ).toThrow(/absolute path/);
    expect(() =>
      assertNoForbiddenPayload({ ref: "C:\\Windows\\clip.mp4" })
    ).toThrow(/absolute path/);
    expect(() =>
      assertNoForbiddenPayload({ ref: "file:///tmp/clip.mp4" })
    ).toThrow(/file:\/\//);
    expect(() =>
      assertNoForbiddenPayload({
        ref: "https://example.com/clip.mp4?signature=abc",
      })
    ).toThrow(/query|fragment|signed|url/i);
    for (const key of FORBIDDEN_RAW_MEDIA_KEYS) {
      expect(() => assertNoForbiddenPayload({ [key]: "x" })).toThrow(
        new RegExp(`forbidden key ${key}`)
      );
    }

    for (const key of [
      "password",
      "Password",
      "accessToken",
      "ACCESSTOKEN",
      "privateKey",
      "PrivateKey",
      "clientSecret",
      "clientsecret",
    ]) {
      expect(() => assertNoForbiddenPayload({ nested: { [key]: "x" } })).toThrow(
        /forbidden key|credential|password|accessToken|privateKey|clientSecret/i
      );
    }

    const bundle = buildNonQualityCalibrationScaffold();
    const manifest = bundle["manifest.json"] as {
      clips: Array<{ id: string; sourceRef: string }>;
    };
    manifest.clips[0]!.id = "demo-bad";
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle))).toThrow(
      /demo-\/syn-/
    );

    const bundle2 = buildNonQualityCalibrationScaffold();
    const manifest2 = bundle2["manifest.json"] as {
      clips: Array<{ id: string; sourceRef: string }>;
    };
    manifest2.clips[0]!.id = "syn-bad";
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle2))).toThrow(
      /demo-\/syn-/
    );

    const bundle3 = buildNonQualityCalibrationScaffold();
    const manifest3 = bundle3["manifest.json"] as {
      clips: Array<{ sourceRef: string }>;
    };
    manifest3.clips[0]!.sourceRef = "https://cdn.example/x.mp4#frag";
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle3))).toThrow(
      /query|fragment|url|ref/i
    );
  });

  it("rejects unpaired ZH zero-overlap without English probe", () => {
    const bundle = buildNonQualityCalibrationScaffold();
    const queries = bundle["queries.json"] as {
      queries: Array<{ overlapProbeQueryId: string | null; queryId: string }>;
    };
    const zh = queries.queries.find(item => item.queryId === "nq-q-04-zh")!;
    zh.overlapProbeQueryId = null;
    expect(() => parseCalibrationBundle(rebuildSnapshotIndex(bundle))).toThrow(
      /overlapProbeQueryId|zero-overlap/
    );
  });

  it("rejects mixed/arbitrary case variants of every forbidden raw-media key", () => {
    const requiredOddCases = [
      "ApiKey",
      "TOKEN",
      "MediaPath",
      "SignedUrl",
      "mEdIaPaTh",
    ];
    for (const key of requiredOddCases) {
      expect(() => assertNoForbiddenPayload({ nested: { [key]: "x" } })).toThrow(
        /forbidden key/i
      );
    }

    for (const key of FORBIDDEN_RAW_MEDIA_KEYS) {
      const variants = new Set([
        key,
        key.toUpperCase(),
        key.toLowerCase(),
        oddlyCasedKey(key),
        key[0]!.toUpperCase() + key.slice(1),
      ]);
      for (const variant of variants) {
        expect(() =>
          assertNoForbiddenPayload({ clip: { [variant]: "x" } })
        ).toThrow(/forbidden key/i);
      }
    }

    // Allowed stable provenance/reference keys remain accepted with safe values.
    expect(() =>
      assertNoForbiddenPayload({
        sourceRef: "calibration-local/nq/nq-clip-01.mp4",
        license: {
          id: "cc0-scaffold",
          evidenceRef: "license-evidence/nq-cc0.txt",
        },
        provenance: "non-quality-in-memory-scaffold",
        rawMediaSha256: "a".repeat(64),
      })
    ).not.toThrow();
  });

  it("binds English zero-overlap probes to self and ZH probes to paired translation-en", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const en = snapshot.queries.queries.find(
      query => query.queryId === "nq-q-04-en"
    )!;
    const zh = snapshot.queries.queries.find(
      query => query.queryId === "nq-q-04-zh"
    )!;
    expect(en.coverageTags).toContain("zero-overlap");
    expect(zh.coverageTags).toContain("zero-overlap");
    expect(en.queryLanguage).toBe("en");
    expect(zh.queryLanguage).toBe("zh");
    expect(en.overlapProbeQueryId).toBe(en.queryId);
    expect(zh.overlapProbeQueryId).toBe(en.queryId);
    expect(zh.intentId).toBe(en.intentId);
    expect(zh.translationPairId).toBe(en.translationPairId);
    expect(en.variantKind).toBe("translation-en");
  });

  it("rejects zero-overlap probe relationship mutations outside self/paired-EN rules", () => {
    const englishPointsToOtherEnglish = buildNonQualityCalibrationScaffold();
    const enMut = (
      englishPointsToOtherEnglish["queries.json"] as {
        queries: Array<{
          queryId: string;
          overlapProbeQueryId: string | null;
        }>;
      }
    ).queries.find(query => query.queryId === "nq-q-04-en")!;
    enMut.overlapProbeQueryId = "nq-q-01-en";
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(englishPointsToOtherEnglish))
    ).toThrow(/overlapProbeQueryId|zero-overlap|self|probe/i);

    const zhPointsToOtherPair = buildNonQualityCalibrationScaffold();
    const zhMut = (
      zhPointsToOtherPair["queries.json"] as {
        queries: Array<{
          queryId: string;
          overlapProbeQueryId: string | null;
        }>;
      }
    ).queries.find(query => query.queryId === "nq-q-04-zh")!;
    zhMut.overlapProbeQueryId = "nq-q-01-en";
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(zhPointsToOtherPair))
    ).toThrow(/overlapProbeQueryId|zero-overlap|translation|pair|intent|probe/i);

    const zhPointsToSelf = buildNonQualityCalibrationScaffold();
    const zhSelf = (
      zhPointsToSelf["queries.json"] as {
        queries: Array<{
          queryId: string;
          overlapProbeQueryId: string | null;
        }>;
      }
    ).queries.find(query => query.queryId === "nq-q-04-zh")!;
    zhSelf.overlapProbeQueryId = "nq-q-04-zh";
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(zhPointsToSelf))
    ).toThrow(/overlapProbeQueryId|zero-overlap|English|en|probe/i);

    const zhPointsToNonEnglish = buildNonQualityCalibrationScaffold();
    const zhNonEn = (
      zhPointsToNonEnglish["queries.json"] as {
        queries: Array<{
          queryId: string;
          overlapProbeQueryId: string | null;
        }>;
      }
    ).queries.find(query => query.queryId === "nq-q-04-zh")!;
    zhNonEn.overlapProbeQueryId = "nq-q-05-zh";
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(zhPointsToNonEnglish))
    ).toThrow(/overlapProbeQueryId|zero-overlap|English|en|probe/i);
  });

  it("binds rawUtf8ByArtifact bytes to the evaluated bundle object (exact-byte auth)", () => {
    const validBundle = buildNonQualityCalibrationScaffold();
    const intentsName = "intents.json" as const;
    const intentsA = validBundle[intentsName];
    const intentsBytesA = JSON.stringify(intentsA);
    expect(sha256Utf8(intentsBytesA)).toBe(
      validBundle["snapshot-index.json"].sha256ByArtifact[intentsName]
    );
    expect(() =>
      parseCalibrationBundle(validBundle, {
        rawUtf8ByArtifact: { [intentsName]: intentsBytesA },
      })
    ).not.toThrow();

    // Bytes authenticate artifact A in the flat snapshot-index, but bundle[name]
    // is a different object B — must reject (do not auth A then evaluate B).
    const mismatched = buildNonQualityCalibrationScaffold();
    const intentsB = structuredClone(mismatched[intentsName]);
    intentsB.intents[0] = {
      ...intentsB.intents[0]!,
      title: `${intentsB.intents[0]!.title} mutated-B`,
    };
    mismatched[intentsName] = intentsB;
    const bytesStillA = JSON.stringify(intentsA);
    const withIndexForA = {
      ...mismatched,
      "snapshot-index.json": {
        ...mismatched["snapshot-index.json"],
        sha256ByArtifact: {
          ...mismatched["snapshot-index.json"].sha256ByArtifact,
          [intentsName]: sha256Utf8(bytesStillA),
        },
      },
    } as CalibrationArtifactBundle;
    expect(sha256Utf8(bytesStillA)).toBe(
      withIndexForA["snapshot-index.json"].sha256ByArtifact[intentsName]
    );
    expect(sha256CanonicalJson(withIndexForA[intentsName])).not.toBe(
      withIndexForA["snapshot-index.json"].sha256ByArtifact[intentsName]
    );
    expect(() =>
      parseCalibrationBundle(withIndexForA, {
        rawUtf8ByArtifact: { [intentsName]: bytesStillA },
      })
    ).toThrow(/raw|byte|bind|mismatch|artifact|utf8|hash/i);

    // Flat snapshot-index + single final-qrels hash contract preserved.
    const snapshot = parseCalibrationBundle(validBundle);
    expect(Object.keys(snapshot.snapshotIndex.sha256ByArtifact).sort()).toEqual(
      CALIBRATION_ARTIFACT_NAMES.filter(
        name => name !== "snapshot-index.json"
      )
        .slice()
        .sort()
    );
    expect(snapshot.evaluationRecord.finalQrelsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(snapshot.evaluationRecord)).not.toMatch(
      /evidenceHash|nested.*hash|dependencyGraph/i
    );
  });

  it("rejects extra top-level artifacts and exactness mutations on repeat presentation / resolvedAt", () => {
    const extraArtifact = buildNonQualityCalibrationScaffold() as CalibrationArtifactBundle &
      Record<string, unknown>;
    extraArtifact["notes.extra.json"] = {
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      snapshotId: SNAPSHOT_ID,
      note: "must not be accepted",
    };
    expect(() => parseCalibrationBundle(extraArtifact as CalibrationArtifactBundle)).toThrow(
      /artifact|extra|unexpected|unknown|top-level/i
    );

    const duplicatePlusMissing = buildNonQualityCalibrationScaffold();
    const repeatRows = (
      duplicatePlusMissing["presentation.repeat.json"] as {
        presentations: Array<{ queryId: string; clipOrder: string[] }>;
      }
    ).presentations;
    expect(repeatRows).toHaveLength(CALIBRATION_QUERY_COUNT);
    const first = repeatRows[0]!;
    const second = repeatRows[1]!;
    repeatRows[1] = { ...first, clipOrder: [...first.clipOrder] };
    expect(repeatRows.filter(row => row.queryId === first.queryId)).toHaveLength(
      2
    );
    expect(
      repeatRows.some(row => row.queryId === second.queryId)
    ).toBe(false);
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(duplicatePlusMissing))
    ).toThrow(/presentation|repeat|query|duplicate|exactly|row/i);

    const extraRow = buildNonQualityCalibrationScaffold();
    const extraPresentations = (
      extraRow["presentation.repeat.json"] as {
        presentations: Array<{ queryId: string; clipOrder: string[] }>;
      }
    ).presentations;
    extraPresentations.push({
      queryId: extraPresentations[0]!.queryId,
      clipOrder: [...extraPresentations[0]!.clipOrder],
    });
    expect(extraPresentations).toHaveLength(CALIBRATION_QUERY_COUNT + 1);
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(extraRow))
    ).toThrow(/presentation|repeat|exactly|10|row|duplicate/i);

    const resolvedBefore = buildNonQualityCalibrationScaffold();
    const beforeFile = resolvedBefore["self-resolutions.json"] as {
      startedAt: string;
      completedAt: string;
      resolutions: Array<{ resolvedAt: string }>;
    };
    expect(beforeFile.resolutions.length).toBeGreaterThan(0);
    beforeFile.resolutions[0]!.resolvedAt = "2026-02-09T23:00:00.000Z";
    expect(
      Date.parse(beforeFile.resolutions[0]!.resolvedAt)
    ).toBeLessThan(Date.parse(beforeFile.startedAt));
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(resolvedBefore))
    ).toThrow(/resolvedAt|startedAt|self-resolution|lifecycle/i);

    const resolvedAfter = buildNonQualityCalibrationScaffold();
    const afterFile = resolvedAfter["self-resolutions.json"] as {
      startedAt: string;
      completedAt: string;
      resolutions: Array<{ resolvedAt: string }>;
    };
    afterFile.resolutions[0]!.resolvedAt = "2026-02-10T19:00:00.000Z";
    expect(
      Date.parse(afterFile.resolutions[0]!.resolvedAt)
    ).toBeGreaterThan(Date.parse(afterFile.completedAt));
    expect(() =>
      parseCalibrationBundle(rebuildSnapshotIndex(resolvedAfter))
    ).toThrow(/resolvedAt|completedAt|self-resolution|lifecycle/i);
  });

  it("shares canonicalEmbeddingContentValues with zero-overlap leaf token checks", () => {
    const probeToken = "zxqsharedcanon";
    const unknownToken = "unknown";
    const metadata: ClipMetadataV2 = {
      description: "teal lakeside wide frame",
      observed: {
        visibleFacts: ["still water"],
        subjects: ["hiker"],
        actions: ["standing"],
        setting: "lakeside",
        weather: [unknownToken],
        environmentType: "outdoor",
        socialContext: "alone",
        activityLevel: "low activity",
        visualDensity: "sparse",
        spatialRelationships: ["centered"],
        time: "daytime",
        lighting: ["soft"],
        colors: ["teal"],
        shotType: "wide",
        cameraMotion: "likely static",
      },
      interpretation: {
        mood: ["calm"],
        atmosphere: ["open"],
        sceneInterpretation: "quiet lakeside beat",
        uncertainty: [`maybe ${probeToken} haze`],
      },
      creative: {
        editingUses: ["transition"],
      },
    };

    const values = requireCanonicalEmbeddingContentValues()(metadata);
    expect(values.join(" ")).not.toMatch(new RegExp(probeToken, "i"));
    expect(values).not.toContain(unknownToken);
    expect(values.some(value => /\bunknown\b/i.test(value))).toBe(false);
    expect(values.join(" ")).toMatch(/teal lakeside wide frame/i);
    expect(values.join(" ")).toMatch(/still water/i);
    expect(values.join(" ")).toMatch(/\bcalm\b/i);
    expect(values.join(" ")).toMatch(/\bopen\b/i);
    expect(values.join(" ")).toMatch(/quiet lakeside beat/i);
    expect(values.join(" ")).toMatch(/transition/i);
    for (const value of values) {
      expect(value).not.toMatch(/^(Description|Mood|Atmosphere|Editing uses):/i);
    }

    const canonical = buildCanonicalEmbeddingText(metadata);
    for (const value of values) {
      expect(canonical).toContain(value);
    }
    expect(canonical).not.toMatch(new RegExp(probeToken, "i"));
    expect(canonical).not.toMatch(/Uncertainty:/i);

    function clipFor(meta: ClipMetadataV2, id: string) {
      return {
        id,
        sourceRef: `calibration-local/nq/${id}.mp4`,
        license: {
          id: "cc0-scaffold",
          evidenceRef: "license-evidence/nq-cc0.txt",
        },
        provenance: "non-quality-in-memory-scaffold",
        rawMediaSha256: shaHexFromSeed(id),
        familyId: "nq-family-shared-canon",
        corpusCoverageTags: ["scaffold"],
        retrievalUnit: { startMs: 0, endMs: 4000, durationMs: 4000 },
        metadataV2Version: "v2",
        canonicalTextVersion: CANONICAL_TEXT_VERSION,
        metadataV2: meta,
      };
    }

    expect(
      checkZeroOverlapV1({
        probeQueryText: probeToken,
        targetClips: [clipFor(metadata, "nq-clip-shared-unc")],
        queryId: "nq-q-shared-canon",
        overlapProbeQueryId: "nq-q-shared-canon",
        a0MatchedTargetIds: [],
        a1MatchedTargetIds: [],
        checkedAt: "2026-02-11T02:50:00.000Z",
      }).passed
    ).toBe(true);

    expect(
      checkZeroOverlapV1({
        probeQueryText: unknownToken,
        targetClips: [clipFor(metadata, "nq-clip-shared-unk")],
        queryId: "nq-q-shared-canon",
        overlapProbeQueryId: "nq-q-shared-canon",
        a0MatchedTargetIds: [],
        a1MatchedTargetIds: [],
        checkedAt: "2026-02-11T02:50:00.000Z",
      }).passed
    ).toBe(true);

    expect(
      checkZeroOverlapV1({
        probeQueryText: probeToken,
        targetClips: [
          clipFor(
            {
              ...metadata,
              description: `${metadata.description} ${probeToken}`,
              interpretation: {
                ...metadata.interpretation,
                uncertainty: ["non-quality scaffold only"],
              },
            },
            "nq-clip-shared-desc"
          ),
        ],
        queryId: "nq-q-shared-canon",
        overlapProbeQueryId: "nq-q-shared-canon",
        a0MatchedTargetIds: [],
        a1MatchedTargetIds: [],
        checkedAt: "2026-02-11T02:50:00.000Z",
      }).passed
    ).toBe(false);
  });

  it("checks zero-overlap-v1 with English probe, content tokens, and diagnostic-only synonyms", () => {
    const tokens = contentTokensForZeroOverlap(
      "[OBSERVED]\nDescription: wistful remembrance hush\nShot: wide"
    );
    expect(tokens).toEqual(
      expect.arrayContaining(["wistful", "remembrance", "hush"])
    );
    for (const label of SEMANTIC_V1_FIXED_LABELS) {
      expect(tokens).not.toContain(label.toLowerCase().replace(/\s+/g, ""));
    }
    expect(tokens).not.toContain("description");
    expect(tokens).not.toContain("shot");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");

    expect(() =>
      contentTokensForZeroOverlap("的 是 在 了")
    ).toThrow(/content token|script|latin/i);
    expect(() =>
      contentTokensForZeroOverlap(ZERO_OVERLAP_STOPLIST.join(" "))
    ).toThrow(/stoplist|content token/i);

    const bundle = buildNonQualityCalibrationScaffold();
    const snapshot = parseCalibrationBundle(bundle);
    const probe = snapshot.queries.queries.find(
      item => item.queryId === "nq-q-04-en"
    )!;
    const target = snapshot.manifest.clips.find(
      clip => clip.id === "nq-clip-04"
    )!;
    const result = checkZeroOverlapV1({
      probeQueryText: probe.text,
      targetClips: [target],
      queryId: probe.queryId,
      overlapProbeQueryId: probe.queryId,
      a0MatchedTargetIds: ["nq-clip-99"],
      a1MatchedTargetIds: ["nq-clip-98"],
      checkedAt: "2026-02-11T02:00:00.000Z",
    });
    expect(result.passed).toBe(true);
    expect(result.checkerVersion).toBe("zero-overlap-v1");
    expect(result.overlapProbeQueryId).toBe("nq-q-04-en");
    expect(result.a0MatchedTargetIds).toEqual(["nq-clip-99"]);
    expect(result.a1MatchedTargetIds).toEqual(["nq-clip-98"]);
    expect(result).not.toHaveProperty("evidenceHash");
  });

  it("extracts zero-overlap target tokens from Metadata V2 leaf content values", () => {
    const metadata: ClipMetadataV2 = {
      description: "outdoor snapshot detail",
      observed: {
        visibleFacts: ["camera snapshot beside lake"],
        subjects: ["hiker"],
        actions: ["standing"],
        setting: "lakeside",
        weather: [],
        environmentType: "outdoor",
        socialContext: "alone",
        activityLevel: "low activity",
        visualDensity: "sparse",
        spatialRelationships: ["centered"],
        time: "daytime",
        lighting: ["soft"],
        colors: ["teal"],
        shotType: "wide",
        cameraMotion: "likely static",
      },
      interpretation: {
        mood: ["calm"],
        atmosphere: ["open"],
        sceneInterpretation: "quiet lakeside beat",
        uncertainty: [],
      },
      creative: {
        editingUses: ["transition"],
      },
    };
    const canonical = buildCanonicalEmbeddingText(metadata);
    expect(canonical).toMatch(/Shot:/i);
    expect(canonical).toMatch(/snapshot/i);

    // Leaf content must keep the intact token `snapshot`. Stripping the fixed
    // label `Shot` from the rendered canonical string must not be the source of
    // truth (substring label strip damages `snapshot`).
    const leafTokens = [
      metadata.description,
      ...metadata.observed.visibleFacts,
      ...metadata.observed.subjects,
      ...metadata.observed.actions,
      metadata.observed.setting,
      metadata.observed.environmentType,
      metadata.observed.socialContext,
      metadata.observed.activityLevel,
      metadata.observed.visualDensity,
      ...metadata.observed.spatialRelationships,
      metadata.observed.time,
      ...metadata.observed.lighting,
      ...metadata.observed.colors,
      metadata.observed.shotType,
      metadata.observed.cameraMotion,
      ...metadata.interpretation.mood,
      ...metadata.interpretation.atmosphere,
      metadata.interpretation.sceneInterpretation,
      ...metadata.creative.editingUses,
    ]
      .join(" ")
      .toLowerCase()
      .match(/[a-z0-9]+/g);
    expect(leafTokens).toContain("snapshot");
    expect(leafTokens).toContain("wide");
    expect(leafTokens).not.toContain("observed");

    const clip = {
      id: "nq-clip-leaf",
      sourceRef: "calibration-local/nq/nq-clip-leaf.mp4",
      license: { id: "cc0-scaffold", evidenceRef: "license-evidence/nq-cc0.txt" },
      provenance: "non-quality-in-memory-scaffold",
      rawMediaSha256: shaHexFromSeed("nq-clip-leaf"),
      familyId: "nq-family-leaf",
      corpusCoverageTags: ["scaffold"],
      retrievalUnit: { startMs: 0, endMs: 4000, durationMs: 4000 },
      metadataV2Version: "v2",
      canonicalTextVersion: CANONICAL_TEXT_VERSION,
      metadataV2: metadata,
    };
    const labelOnlyProbe = checkZeroOverlapV1({
      probeQueryText: "shot",
      targetClips: [clip],
      queryId: "nq-q-leaf",
      overlapProbeQueryId: "nq-q-leaf",
      a0MatchedTargetIds: [],
      a1MatchedTargetIds: [],
      checkedAt: "2026-02-11T02:30:00.000Z",
    });
    expect(labelOnlyProbe.passed).toBe(true);

    const contentProbe = checkZeroOverlapV1({
      probeQueryText: "snapshot",
      targetClips: [clip],
      queryId: "nq-q-leaf",
      overlapProbeQueryId: "nq-q-leaf",
      a0MatchedTargetIds: [],
      a1MatchedTargetIds: [],
      checkedAt: "2026-02-11T02:30:00.000Z",
    });
    expect(contentProbe.passed).toBe(false);
  });

  it("compares zero-overlap targets to semantic-v1 included content values only", () => {
    const probeToken = "zxqprobeomit";
    const baseMetadata: ClipMetadataV2 = {
      description: "teal lakeside wide frame",
      observed: {
        visibleFacts: ["still water"],
        subjects: ["hiker"],
        actions: ["standing"],
        setting: "lakeside",
        weather: ["unknown"],
        environmentType: "outdoor",
        socialContext: "alone",
        activityLevel: "low activity",
        visualDensity: "sparse",
        spatialRelationships: ["centered"],
        time: "daytime",
        lighting: ["soft"],
        colors: ["teal"],
        shotType: "wide",
        cameraMotion: "likely static",
      },
      interpretation: {
        mood: ["calm"],
        atmosphere: ["open"],
        sceneInterpretation: "quiet lakeside beat",
        uncertainty: [`maybe ${probeToken} haze`],
      },
      creative: {
        editingUses: ["transition"],
      },
    };

    const canonical = buildCanonicalEmbeddingText(baseMetadata);
    expect(canonical).not.toMatch(new RegExp(probeToken, "i"));
    expect(canonical).not.toMatch(/\bunknown\b/i);
    expect(canonical).not.toMatch(/Uncertainty:/i);

    function clipFor(metadata: ClipMetadataV2, id: string) {
      return {
        id,
        sourceRef: `calibration-local/nq/${id}.mp4`,
        license: {
          id: "cc0-scaffold",
          evidenceRef: "license-evidence/nq-cc0.txt",
        },
        provenance: "non-quality-in-memory-scaffold",
        rawMediaSha256: shaHexFromSeed(id),
        familyId: "nq-family-semantic-v1",
        corpusCoverageTags: ["scaffold"],
        retrievalUnit: { startMs: 0, endMs: 4000, durationMs: 4000 },
        metadataV2Version: "v2",
        canonicalTextVersion: CANONICAL_TEXT_VERSION,
        metadataV2: metadata,
      };
    }

    const uncertaintyOnly = checkZeroOverlapV1({
      probeQueryText: probeToken,
      targetClips: [clipFor(baseMetadata, "nq-clip-sem-unc")],
      queryId: "nq-q-sem-v1",
      overlapProbeQueryId: "nq-q-sem-v1",
      a0MatchedTargetIds: [],
      a1MatchedTargetIds: [],
      checkedAt: "2026-02-11T02:45:00.000Z",
    });
    // Probe lives only in interpretation.uncertainty, which semantic-v1 omits.
    expect(uncertaintyOnly.passed).toBe(true);

    const includedLeaf = checkZeroOverlapV1({
      probeQueryText: probeToken,
      targetClips: [
        clipFor(
          {
            ...baseMetadata,
            description: `${baseMetadata.description} ${probeToken}`,
            interpretation: {
              ...baseMetadata.interpretation,
              uncertainty: ["non-quality scaffold only"],
            },
          },
          "nq-clip-sem-desc"
        ),
      ],
      queryId: "nq-q-sem-v1",
      overlapProbeQueryId: "nq-q-sem-v1",
      a0MatchedTargetIds: [],
      a1MatchedTargetIds: [],
      checkedAt: "2026-02-11T02:45:00.000Z",
    });
    expect(includedLeaf.passed).toBe(false);

    const unknownOmitted = checkZeroOverlapV1({
      probeQueryText: "unknown",
      targetClips: [clipFor(baseMetadata, "nq-clip-sem-unk")],
      queryId: "nq-q-sem-v1",
      overlapProbeQueryId: "nq-q-sem-v1",
      a0MatchedTargetIds: [],
      a1MatchedTargetIds: [],
      checkedAt: "2026-02-11T02:45:00.000Z",
    });
    // Exact "unknown" is omitted from semantic-v1 canonical content.
    expect(unknownOmitted.passed).toBe(true);
  });
});

describe("calibration A0/A1-only evaluation/report", () => {
  it("runs lexical A0/A1 only with fixed Precision@5 and optional diagnostic Recall@10", () => {
    const bundle = buildNonQualityCalibrationScaffold();
    const snapshot = parseCalibrationBundle(bundle);

    const qualitativeNotesByQuery = qualitativeNotesForSnapshot(snapshot);

    expect(() =>
      runCalibrationLexicalEval(snapshot, {
        includePilotCorpusRecallAt10Diagnostic: true,
        qualitativeNotesByQuery: Object.fromEntries(
          snapshot.queries.queries.map(query => [
            query.queryId,
            { A0: [], A1: [] },
          ])
        ),
      })
    ).toThrow(/qualitative notes/);

    const report = runCalibrationLexicalEval(snapshot, {
      includePilotCorpusRecallAt10Diagnostic: true,
      qualitativeNotesByQuery,
      checkedAt: "2026-02-11T03:00:00.000Z",
    });

    expect(report.systems).toEqual(["A0", "A1"]);
    expect(report).not.toHaveProperty("B0");
    expect(report).not.toHaveProperty("C0");
    expect(report).not.toHaveProperty("C1");
    expect(report.disclaimer).toBe(CALIBRATION_REPORT_DISCLAIMER);
    expect(report.antiDegeneracyNote).toBe(ANTI_DEGENERACY_NOTE);
    expect(report.byIntentNdcg).toHaveLength(CALIBRATION_INTENT_COUNT);
    for (const row of report.byIntentNdcg) {
      expect(["W", "T", "L"]).toContain(row.a1VsA0);
      expect(typeof row.meanNdcgAt10A0).toBe("number");
      expect(typeof row.meanNdcgAt10A1).toBe("number");
    }
    expect(report.intraAnnotatorConsistency.comparedPairs).toBe(
      CALIBRATION_REPEAT_LABEL_COUNT
    );
    expect(report.intraAnnotatorConsistency.exactGrade).toBeGreaterThan(0);
    expect(report.intraAnnotatorConsistency.binaryAtLeast2).toBeGreaterThan(0);
    expect(JSON.stringify(report.intraAnnotatorConsistency)).not.toMatch(
      /inter|adjudicat/i
    );

    for (const query of report.queries) {
      expect(query.A0.metrics).toEqual(
        expect.objectContaining({
          successAt5: expect.any(Number),
          precisionAt5: expect.any(Number),
          ndcgAt10: expect.any(Number),
          pilotCorpusRecallAt10Diagnostic: expect.any(Number),
        })
      );
      expect(query.A0.metrics).not.toHaveProperty("recallAt5");
      expect(query.A1.metrics).not.toHaveProperty("recallAt5");
      expect(query.A0.top5Notes).toHaveLength(
        Math.min(5, query.A0.ranking.length)
      );
      expect(query.A1.top5Notes).toHaveLength(
        Math.min(5, query.A1.ranking.length)
      );
      for (const note of [...query.A0.top5Notes, ...query.A1.top5Notes]) {
        expect(note.note.trim().length).toBeGreaterThan(0);
        expect(note.rank).toBeGreaterThanOrEqual(1);
        expect(note.rank).toBeLessThanOrEqual(5);
      }
    }

    expect(report.zeroOverlapChecks.length).toBeGreaterThan(0);
    for (const pattern of FORBIDDEN_QUALITY_CLAIM_PATTERNS) {
      if (
        pattern.source.includes("representative") ||
        pattern.source.includes("generalized")
      ) {
        // Anti-degeneracy note may mention these as disallowed claims.
        continue;
      }
      expect(report.disclaimer).not.toMatch(
        /is semantic lift|is production-ready|is multilingual-ready/i
      );
    }
    expect(report.disclaimer.toLowerCase()).toMatch(
      /not semantic lift|not.*production-ready|not.*m5 go\/no-go/
    );
    expect(report.antiDegeneracyNote.toLowerCase()).toMatch(
      /cannot support representative|generalized quality/
    );
  });

  it("includes per-intent mean Success@5/Precision@5 deltas and optional Recall@10", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    const report = runCalibrationLexicalEval(snapshot, {
      includePilotCorpusRecallAt10Diagnostic: true,
      qualitativeNotesByQuery: qualitativeNotesForSnapshot(snapshot),
    });

    expect(report.byIntentNdcg).toHaveLength(CALIBRATION_INTENT_COUNT);
    for (const row of report.byIntentNdcg) {
      expect(row).toEqual(
        expect.objectContaining({
          intentId: expect.any(String),
          meanNdcgAt10A0: expect.any(Number),
          meanNdcgAt10A1: expect.any(Number),
          meanSuccessAt5A0: expect.any(Number),
          meanSuccessAt5A1: expect.any(Number),
          successAt5A1MinusA0: expect.any(Number),
          meanPrecisionAt5A0: expect.any(Number),
          meanPrecisionAt5A1: expect.any(Number),
          precisionAt5A1MinusA0: expect.any(Number),
          meanPilotCorpusRecallAt10A0: expect.any(Number),
          meanPilotCorpusRecallAt10A1: expect.any(Number),
          pilotCorpusRecallAt10A1MinusA0: expect.any(Number),
          a1VsA0: expect.stringMatching(/^[WTL]$/),
        })
      );
      const extended = row as {
        meanSuccessAt5A0: number;
        meanSuccessAt5A1: number;
        successAt5A1MinusA0: number;
        meanPrecisionAt5A0: number;
        meanPrecisionAt5A1: number;
        precisionAt5A1MinusA0: number;
        meanPilotCorpusRecallAt10A0: number;
        meanPilotCorpusRecallAt10A1: number;
        pilotCorpusRecallAt10A1MinusA0: number;
        meanNdcgAt10A0: number;
        meanNdcgAt10A1: number;
        a1VsA0: "W" | "T" | "L";
      };
      expect(extended.successAt5A1MinusA0).toBeCloseTo(
        extended.meanSuccessAt5A1 - extended.meanSuccessAt5A0,
        12
      );
      expect(extended.precisionAt5A1MinusA0).toBeCloseTo(
        extended.meanPrecisionAt5A1 - extended.meanPrecisionAt5A0,
        12
      );
      expect(extended.pilotCorpusRecallAt10A1MinusA0).toBeCloseTo(
        extended.meanPilotCorpusRecallAt10A1 -
          extended.meanPilotCorpusRecallAt10A0,
        12
      );
      const expectedWtl =
        extended.meanNdcgAt10A1 > extended.meanNdcgAt10A0
          ? "W"
          : extended.meanNdcgAt10A1 < extended.meanNdcgAt10A0
            ? "L"
            : "T";
      expect(extended.a1VsA0).toBe(expectedWtl);
    }
  });

  it("rejects declared zero-overlap queries when grade>=2 targets have content overlap", () => {
    const bundle = buildNonQualityCalibrationScaffold();
    const manifest = bundle["manifest.json"] as {
      clips: Array<{ id: string; metadataV2: ClipMetadataV2 }>;
    };
    const target = manifest.clips.find(clip => clip.id === "nq-clip-04")!;
    target.metadataV2 = {
      ...target.metadataV2,
      description: `${target.metadataV2.description} wistful remembrance hush`,
      observed: {
        ...target.metadataV2.observed,
        visibleFacts: [
          ...target.metadataV2.observed.visibleFacts,
          "wistful remembrance hush",
        ],
      },
    };
    const snapshot = parseCalibrationBundle(rebuildSnapshotIndex(bundle));
    expect(() =>
      runCalibrationLexicalEval(snapshot, {
        qualitativeNotesByQuery: qualitativeNotesForSnapshot(snapshot),
        checkedAt: "2026-02-11T03:30:00.000Z",
      })
    ).toThrow(/zero-overlap|overlap/i);
  });

  it("requires structured nonempty qualitative review for every actual top-five hit", () => {
    const snapshot = parseCalibrationBundle(
      buildNonQualityCalibrationScaffold()
    );
    expect(() =>
      runCalibrationLexicalEval(snapshot, {
        qualitativeNotesByQuery: {
          "nq-q-01-en": {
            A0: [{ clipId: "nq-clip-01", rank: 1, note: "   " }],
            A1: [],
          },
        },
      })
    ).toThrow(/qualitative|nonempty|note/i);
  });

  it("uses intra-annotator-only wording and forbids readiness/quality claims", () => {
    expect(CALIBRATION_REPORT_DISCLAIMER).toMatch(/Solo-MVP/i);
    expect(CALIBRATION_REPORT_DISCLAIMER).not.toMatch(/inter-annotator/i);
    expect(CALIBRATION_REPORT_DISCLAIMER).not.toMatch(/adjudicat/i);
    expect(CALIBRATION_REPORT_DISCLAIMER).toMatch(/not semantic lift/i);
    expect(CALIBRATION_REPORT_DISCLAIMER).toMatch(/not.*production-ready/i);
    expect(CALIBRATION_REPORT_DISCLAIMER).toMatch(/not.*m5 go\/no-go/i);
    expect(CALIBRATION_REPORT_DISCLAIMER).toMatch(/not.*multilingual-ready/i);
    expect(ANTI_DEGENERACY_NOTE).toMatch(
      /cannot support representative|generalized quality/i
    );
    expect(ANTI_DEGENERACY_NOTE).not.toMatch(
      /representative quality evidence|proves generalized/i
    );
  });
});
