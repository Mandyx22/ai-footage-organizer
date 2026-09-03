import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVITY_LEVELS,
  ENVIRONMENT_TYPES,
  SOCIAL_CONTEXTS,
  VISUAL_DENSITIES,
  type ActivityLevel,
  type ClipMetadataV2,
  type EnvironmentType,
  type SocialContext,
  type VisualDensity,
} from "./footage";

export const EVAL_GOLD_VERSION = "m5a-harness-v2" as const;

export const REQUIRED_EVAL_QUERY_TEXTS = [
  "quiet blue night shots",
  "找一些让我感觉有点孤独但又很温暖的镜头",
  "适合做一个安静夏日回忆 montage 的素材",
  "something open and reflective",
] as const;

export const EVAL_SEMANTIC_CATEGORIES = [
  "exact-factual",
  "subjective-mood",
  "atmosphere",
  "editing-intent",
  "zero-lexical-overlap",
  "negative-compositional",
] as const;

export const EVAL_CLIP_SOURCES = ["demo", "synthetic"] as const;

export const EVAL_QUERY_LANGUAGES = ["en", "zh", "mixed"] as const;

export const EVAL_LANGUAGE_RELATIONS = [
  "same-language",
  "cross-lingual",
] as const;

export const EVAL_LANGUAGE_SLICES = [
  "english-same-language",
  "chinese-same-language",
  "chinese-cross-lingual",
  "mixed-language",
] as const;

export type EvalSemanticCategory = (typeof EVAL_SEMANTIC_CATEGORIES)[number];
export type EvalClipSource = (typeof EVAL_CLIP_SOURCES)[number];
export type EvalQueryLanguage = (typeof EVAL_QUERY_LANGUAGES)[number];
export type EvalLanguageRelation = (typeof EVAL_LANGUAGE_RELATIONS)[number];
export type EvalLanguageSlice = (typeof EVAL_LANGUAGE_SLICES)[number];
export type RelevanceGrade = 0 | 1 | 2 | 3;

export type EvalClip = {
  id: string;
  source: EvalClipSource;
  metadataV2: ClipMetadataV2;
};

export type EvalJudgment = {
  clipId: string;
  grade: RelevanceGrade;
};

export type EvalQuery = {
  id: string;
  text: string;
  queryLanguage: EvalQueryLanguage;
  /**
   * Language relation between the query language and the intended relevant
   * searchable metadata evidence. Not UI language, and not a requirement that
   * the entire Metadata V2 object use one language.
   */
  languageRelation: EvalLanguageRelation;
  semanticCategories: EvalSemanticCategory[];
  judgments: EvalJudgment[];
};

export type EvalGoldSet = {
  version: typeof EVAL_GOLD_VERSION;
  purpose: string;
  clips: EvalClip[];
  queries: EvalQuery[];
};

export const EVAL_LANGUAGE_SLICE_BY_COMBINATION = {
  "en/same-language": "english-same-language",
  "zh/same-language": "chinese-same-language",
  "zh/cross-lingual": "chinese-cross-lingual",
  "mixed/cross-lingual": "mixed-language",
} as const;

export function languageSliceFor(
  query: Pick<EvalQuery, "queryLanguage" | "languageRelation">
): EvalLanguageSlice {
  const key = `${query.queryLanguage}/${query.languageRelation}`;
  const slice =
    EVAL_LANGUAGE_SLICE_BY_COMBINATION[
      key as keyof typeof EVAL_LANGUAGE_SLICE_BY_COMBINATION
    ];
  if (!slice) {
    throw new Error(
      `unsupported language combination: queryLanguage=${query.queryLanguage} languageRelation=${query.languageRelation}`
    );
  }
  return slice;
}

const GOLD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../eval/gold"
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
  path: string
): T[number] {
  assert(
    typeof value === "string" && values.includes(value),
    `${path} is invalid`
  );
  return value as T[number];
}

function asString(value: unknown, path: string) {
  assert(typeof value === "string", `${path} must be a string`);
  return value;
}

function asStringArray(value: unknown, path: string) {
  assert(
    Array.isArray(value) && value.every(item => typeof item === "string"),
    `${path} must be a string array`
  );
  return value;
}

function parseMetadataV2(value: unknown, path: string): ClipMetadataV2 {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`
  );
  const metadata = value as Record<string, unknown>;
  assert(
    metadata.observed !== null &&
      typeof metadata.observed === "object" &&
      !Array.isArray(metadata.observed),
    `${path}.observed must be an object`
  );
  assert(
    metadata.interpretation !== null &&
      typeof metadata.interpretation === "object" &&
      !Array.isArray(metadata.interpretation),
    `${path}.interpretation must be an object`
  );
  assert(
    metadata.creative !== null &&
      typeof metadata.creative === "object" &&
      !Array.isArray(metadata.creative),
    `${path}.creative must be an object`
  );
  const observed = metadata.observed as Record<string, unknown>;
  const interpretation = metadata.interpretation as Record<string, unknown>;
  const creative = metadata.creative as Record<string, unknown>;

  return {
    description: asString(metadata.description, `${path}.description`),
    observed: {
      visibleFacts: asStringArray(
        observed.visibleFacts,
        `${path}.observed.visibleFacts`
      ),
      subjects: asStringArray(observed.subjects, `${path}.observed.subjects`),
      actions: asStringArray(observed.actions, `${path}.observed.actions`),
      setting: asString(observed.setting, `${path}.observed.setting`),
      weather: asStringArray(observed.weather, `${path}.observed.weather`),
      environmentType: isOneOf(
        observed.environmentType,
        ENVIRONMENT_TYPES,
        `${path}.observed.environmentType`
      ) as EnvironmentType,
      socialContext: isOneOf(
        observed.socialContext,
        SOCIAL_CONTEXTS,
        `${path}.observed.socialContext`
      ) as SocialContext,
      activityLevel: isOneOf(
        observed.activityLevel,
        ACTIVITY_LEVELS,
        `${path}.observed.activityLevel`
      ) as ActivityLevel,
      visualDensity: isOneOf(
        observed.visualDensity,
        VISUAL_DENSITIES,
        `${path}.observed.visualDensity`
      ) as VisualDensity,
      spatialRelationships: asStringArray(
        observed.spatialRelationships,
        `${path}.observed.spatialRelationships`
      ),
      time: asString(observed.time, `${path}.observed.time`),
      lighting: asStringArray(observed.lighting, `${path}.observed.lighting`),
      colors: asStringArray(observed.colors, `${path}.observed.colors`),
      shotType: asString(observed.shotType, `${path}.observed.shotType`),
      cameraMotion: asString(
        observed.cameraMotion,
        `${path}.observed.cameraMotion`
      ),
    },
    interpretation: {
      mood: asStringArray(interpretation.mood, `${path}.interpretation.mood`),
      atmosphere: asStringArray(
        interpretation.atmosphere,
        `${path}.interpretation.atmosphere`
      ),
      sceneInterpretation: asString(
        interpretation.sceneInterpretation,
        `${path}.interpretation.sceneInterpretation`
      ),
      uncertainty: asStringArray(
        interpretation.uncertainty,
        `${path}.interpretation.uncertainty`
      ),
    },
    creative: {
      editingUses: asStringArray(
        creative.editingUses,
        `${path}.creative.editingUses`
      ),
    },
  };
}

function parseClip(value: unknown, index: number): EvalClip {
  const path = `clips[${index}]`;
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`
  );
  const clip = value as Record<string, unknown>;
  return {
    id: asString(clip.id, `${path}.id`),
    source: isOneOf(clip.source, EVAL_CLIP_SOURCES, `${path}.source`),
    metadataV2: parseMetadataV2(clip.metadataV2, `${path}.metadataV2`),
  };
}

function parseJudgment(value: unknown, path: string): EvalJudgment {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`
  );
  const judgment = value as Record<string, unknown>;
  assert(
    judgment.grade === 0 ||
      judgment.grade === 1 ||
      judgment.grade === 2 ||
      judgment.grade === 3,
    `${path}.grade must be 0 | 1 | 2 | 3`
  );
  return {
    clipId: asString(judgment.clipId, `${path}.clipId`),
    grade: judgment.grade,
  };
}

function parseQuery(value: unknown, index: number): EvalQuery {
  const path = `queries[${index}]`;
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`
  );
  const query = value as Record<string, unknown>;
  assert(
    Array.isArray(query.semanticCategories),
    `${path}.semanticCategories must be an array`
  );
  assert(Array.isArray(query.judgments), `${path}.judgments must be an array`);
  const semanticCategories = query.semanticCategories.map(
    (category, categoryIndex) =>
      isOneOf(
        category,
        EVAL_SEMANTIC_CATEGORIES,
        `${path}.semanticCategories[${categoryIndex}]`
      )
  );
  assert(
    semanticCategories.length > 0,
    `${path}.semanticCategories must not be empty`
  );
  const queryLanguage = isOneOf(
    query.queryLanguage,
    EVAL_QUERY_LANGUAGES,
    `${path}.queryLanguage`
  );
  const languageRelation = isOneOf(
    query.languageRelation,
    EVAL_LANGUAGE_RELATIONS,
    `${path}.languageRelation`
  );
  try {
    languageSliceFor({ queryLanguage, languageRelation });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: ${detail}`);
  }
  return {
    id: asString(query.id, `${path}.id`),
    text: asString(query.text, `${path}.text`),
    queryLanguage,
    languageRelation,
    semanticCategories,
    judgments: query.judgments.map((judgment, judgmentIndex) =>
      parseJudgment(judgment, `${path}.judgments[${judgmentIndex}]`)
    ),
  };
}

export function parseEvalGold(
  clipsJson: unknown,
  queriesJson: unknown
): EvalGoldSet {
  assert(
    clipsJson !== null &&
      typeof clipsJson === "object" &&
      !Array.isArray(clipsJson),
    "clips file must be an object"
  );
  assert(
    queriesJson !== null &&
      typeof queriesJson === "object" &&
      !Array.isArray(queriesJson),
    "queries file must be an object"
  );
  const clipsFile = clipsJson as Record<string, unknown>;
  const queriesFile = queriesJson as Record<string, unknown>;
  assert(
    clipsFile.version === EVAL_GOLD_VERSION,
    `clips.version must be ${EVAL_GOLD_VERSION}`
  );
  assert(
    queriesFile.version === EVAL_GOLD_VERSION,
    `queries.version must be ${EVAL_GOLD_VERSION}`
  );
  assert(Array.isArray(clipsFile.clips), "clips.clips must be an array");
  assert(
    Array.isArray(queriesFile.queries),
    "queries.queries must be an array"
  );

  const clips = clipsFile.clips.map(parseClip);
  const queries = queriesFile.queries.map(parseQuery);
  const clipIds = new Set(clips.map(clip => clip.id));
  assert(clipIds.size === clips.length, "eval clip ids must be unique");
  assert(
    new Set(queries.map(query => query.id)).size === queries.length,
    "eval query ids must be unique"
  );

  for (const query of queries) {
    for (const judgment of query.judgments) {
      assert(
        clipIds.has(judgment.clipId),
        `query ${query.id} judgment references unknown clip ${judgment.clipId}`
      );
    }
  }

  const queryTexts = new Set(queries.map(query => query.text));
  for (const required of REQUIRED_EVAL_QUERY_TEXTS) {
    assert(
      queryTexts.has(required),
      `eval queries must include ${JSON.stringify(required)}`
    );
  }

  return {
    version: EVAL_GOLD_VERSION,
    purpose: asString(queriesFile.purpose, "queries.purpose"),
    clips,
    queries,
  };
}

export function loadExampleEvalGold(): EvalGoldSet {
  const clipsJson = JSON.parse(
    readFileSync(path.join(GOLD_DIR, "clips.example.json"), "utf8")
  ) as unknown;
  const queriesJson = JSON.parse(
    readFileSync(path.join(GOLD_DIR, "queries.json"), "utf8")
  ) as unknown;
  return parseEvalGold(clipsJson, queriesJson);
}
