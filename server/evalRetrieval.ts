import {
  buildCanonicalEmbeddingText,
  CANONICAL_TEXT_VERSION,
} from "./canonicalText";
import { rankByCosine } from "./cosine";
import { rankFootageA1 } from "./evalLexical";
import {
  EVAL_QUERY_CATEGORIES,
  loadExampleEvalGold,
  type EvalClip,
  type EvalGoldSet,
  type EvalQueryCategory,
} from "./evalGold";
import {
  meanMetricSet,
  metricsForRanking,
  type MetricSet,
} from "./evalMetrics";
import { metadataV2ToLegacy, rankFootage, type FootageClip } from "./footage";
import { rrfFuse } from "./rrf";
import {
  embeddingIndexKey,
  type EmbeddingProvider,
} from "./_core/embeddingProvider";
import {
  createFakeEmbeddingProvider,
  FAKE_PROVIDER_DISCLAIMER,
} from "./_core/fakeEmbeddingProvider";
import {
  OPENAI_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_NATIVE_DIMENSION,
  OPENAI_EMBEDDING_PROVIDER_ID,
} from "./_core/openaiEmbeddingProvider";
import {
  QWEN_EMBEDDING_PROVIDER_ID,
  QWEN_REAL_SMOKE_STATUS,
} from "./_core/qwenEmbeddingProvider";

export const HARNESS_NOTE =
  "Metrics validate the harness pipeline. They are not retrieval-quality evidence.";
export const REAL_VECTOR_HARNESS_DISCLAIMER =
  "openai real vectors — harness validation only; not a quality benchmark";
export const REAL_VECTOR_HARNESS_NOTE =
  "Real OpenAI vectors validate harness wiring only. They are not retrieval-quality evidence and must not choose a production model.";
export const A0_EVAL_NOTE =
  "A0 evaluation excludes zero-score fallback results";

export type LexicalRankedHit = {
  clipId: string;
  score: number;
  reasons: string[];
};

export type SemanticRankedHit = {
  clipId: string;
  cosine: number;
};

export type FusedRankedHit = {
  clipId: string;
  rrf: number;
};

export type SystemMetrics = {
  A0: MetricSet;
  A1: MetricSet;
  B0: MetricSet;
  C0: MetricSet;
  C1: MetricSet;
};

export type QueryEvalResult = {
  queryId: string;
  text: string;
  language: string;
  categories: EvalQueryCategory[];
  A0: { ranking: LexicalRankedHit[]; metrics: MetricSet };
  A1: { ranking: LexicalRankedHit[]; metrics: MetricSet };
  B0: { ranking: SemanticRankedHit[]; metrics: MetricSet };
  C0: { ranking: FusedRankedHit[]; metrics: MetricSet };
  C1: { ranking: FusedRankedHit[]; metrics: MetricSet };
};

export type OfflineEvalReport = {
  disclaimer: string;
  note: string;
  a0EvalNote: typeof A0_EVAL_NOTE;
  provider: {
    id: string;
    model: string;
    dimension: number;
  };
  indexKey: string;
  canonicalTextVersion: typeof CANONICAL_TEXT_VERSION;
  clipCount: number;
  queryCount: number;
  overall: SystemMetrics;
  byCategory: Record<EvalQueryCategory, SystemMetrics>;
  queries: QueryEvalResult[];
};

function assertHarnessProvider(provider: EmbeddingProvider) {
  if (provider.id === "fake") return "fake" as const;
  if (
    provider.id === OPENAI_EMBEDDING_PROVIDER_ID &&
    provider.model === OPENAI_EMBEDDING_MODEL &&
    provider.dimension === OPENAI_EMBEDDING_NATIVE_DIMENSION
  ) {
    return "openai" as const;
  }
  if (provider.id === QWEN_EMBEDDING_PROVIDER_ID) {
    throw new Error(
      `Qwen real-vector harness is ${QWEN_REAL_SMOKE_STATUS}. No endpoint, model, or provider fallback.`
    );
  }
  throw new Error(
    "This M5A harness batch only runs the fake EmbeddingProvider or OpenAI text-embedding-3-large native 3072"
  );
}

function evalClipToFootageClip(clip: EvalClip, numericId: number): FootageClip {
  return {
    id: numericId,
    projectIds: [],
    fileName: `${clip.id}.mov`,
    durationMs: 0,
    thumbnailUrl: null,
    mediaUrl: null,
    status: "ready",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    ...metadataV2ToLegacy(clip.metadataV2),
    metadataJson: clip.metadataV2,
  };
}

function formatMetricSet(metrics: MetricSet): string {
  const n = (value: number) => value.toFixed(4);
  return `Recall@5=${n(metrics.recallAt5)}  Recall@10=${n(metrics.recallAt10)}  Success@5=${n(metrics.successAt5)}  nDCG@10=${n(metrics.ndcgAt10)}`;
}

function lexicalHits(
  ranked: ReturnType<typeof rankFootage>,
  evalIdByNumericId: Map<number, string>
): LexicalRankedHit[] {
  return ranked
    .filter(item => item.score > 0)
    .map(item => ({
      clipId: evalIdByNumericId.get(item.clip.id) ?? String(item.clip.id),
      score: item.score,
      reasons: item.reasons,
    }));
}

function fusedHits(fused: ReturnType<typeof rrfFuse>): FusedRankedHit[] {
  return fused.map(item => ({ clipId: item.id, rrf: item.score }));
}

function metricsFromIds(
  rankedIds: string[],
  judgments: EvalGoldSet["queries"][number]["judgments"]
) {
  return metricsForRanking(rankedIds, judgments);
}

function meanSystems(queries: QueryEvalResult[]): SystemMetrics {
  return {
    A0: meanMetricSet(queries.map(query => query.A0.metrics)),
    A1: meanMetricSet(queries.map(query => query.A1.metrics)),
    B0: meanMetricSet(queries.map(query => query.B0.metrics)),
    C0: meanMetricSet(queries.map(query => query.C0.metrics)),
    C1: meanMetricSet(queries.map(query => query.C1.metrics)),
  };
}

export async function runOfflineRetrievalEval(options: {
  gold: EvalGoldSet;
  provider: EmbeddingProvider;
}): Promise<OfflineEvalReport> {
  const { gold, provider } = options;
  const harnessMode = assertHarnessProvider(provider);
  const disclaimer =
    harnessMode === "fake"
      ? FAKE_PROVIDER_DISCLAIMER
      : REAL_VECTOR_HARNESS_DISCLAIMER;
  const note = harnessMode === "fake" ? HARNESS_NOTE : REAL_VECTOR_HARNESS_NOTE;

  const footageClips = gold.clips.map((clip, index) =>
    evalClipToFootageClip(clip, index + 1)
  );
  const evalIdByNumericId = new Map(
    gold.clips.map((clip, index) => [index + 1, clip.id] as const)
  );

  const canonicalTexts = gold.clips.map(clip =>
    buildCanonicalEmbeddingText(clip.metadataV2)
  );
  const documentVectors = await provider.embedDocuments(canonicalTexts);
  if (documentVectors.length !== gold.clips.length) {
    throw new Error("embedDocuments returned the wrong number of vectors");
  }

  const queries: QueryEvalResult[] = [];

  for (const query of gold.queries) {
    const a0 = lexicalHits(
      rankFootage(footageClips, query.text),
      evalIdByNumericId
    );
    const a1 = lexicalHits(
      rankFootageA1(footageClips, query.text),
      evalIdByNumericId
    );
    const queryVector = await provider.embedQuery(query.text);
    const b0 = rankByCosine(
      queryVector,
      gold.clips.map((clip, index) => ({
        id: clip.id,
        vector: documentVectors[index],
      }))
    ).map(hit => ({ clipId: hit.id, cosine: hit.cosine }));

    const c0 = rrfFuse([a0.map(hit => hit.clipId), b0.map(hit => hit.clipId)]);
    const c1 = rrfFuse([a1.map(hit => hit.clipId), b0.map(hit => hit.clipId)]);

    queries.push({
      queryId: query.id,
      text: query.text,
      language: query.language,
      categories: query.categories,
      A0: {
        ranking: a0,
        metrics: metricsFromIds(
          a0.map(hit => hit.clipId),
          query.judgments
        ),
      },
      A1: {
        ranking: a1,
        metrics: metricsFromIds(
          a1.map(hit => hit.clipId),
          query.judgments
        ),
      },
      B0: {
        ranking: b0,
        metrics: metricsFromIds(
          b0.map(hit => hit.clipId),
          query.judgments
        ),
      },
      C0: {
        ranking: fusedHits(c0),
        metrics: metricsFromIds(
          c0.map(hit => hit.id),
          query.judgments
        ),
      },
      C1: {
        ranking: fusedHits(c1),
        metrics: metricsFromIds(
          c1.map(hit => hit.id),
          query.judgments
        ),
      },
    });
  }

  const byCategory = Object.fromEntries(
    EVAL_QUERY_CATEGORIES.map(category => {
      const slice = queries.filter(query =>
        query.categories.includes(category)
      );
      return [category, meanSystems(slice)];
    })
  ) as OfflineEvalReport["byCategory"];

  return {
    disclaimer,
    note,
    a0EvalNote: A0_EVAL_NOTE,
    provider: {
      id: provider.id,
      model: provider.model,
      dimension: provider.dimension,
    },
    indexKey: embeddingIndexKey(provider, CANONICAL_TEXT_VERSION),
    canonicalTextVersion: CANONICAL_TEXT_VERSION,
    clipCount: gold.clips.length,
    queryCount: gold.queries.length,
    overall: meanSystems(queries),
    byCategory,
    queries,
  };
}

export async function runFakeHarnessEval(): Promise<OfflineEvalReport> {
  return runOfflineRetrievalEval({
    gold: loadExampleEvalGold(),
    provider: createFakeEmbeddingProvider(),
  });
}

function formatHits(ids: string[]) {
  return ids.join(",") || "(none)";
}

export function formatEvalReport(report: OfflineEvalReport): string {
  const wiringOnly = "harness validation only";
  const lines = [
    "Framefind M5A offline retrieval eval",
    report.disclaimer,
    report.note,
    report.a0EvalNote,
    `provider: ${report.provider.id} / ${report.provider.model} / dim=${report.provider.dimension}`,
    `index key: ${report.indexKey}`,
    `canonicalTextVersion: ${report.canonicalTextVersion}`,
    `clips: ${report.clipCount}  queries: ${report.queryCount}`,
    "",
    `Overall (${wiringOnly})`,
    `  A0 current lexical                      ${formatMetricSet(report.overall.A0)}`,
    `  A1 eval-only multilingual lexical       ${formatMetricSet(report.overall.A1)}`,
    `  B0 embedding                            ${formatMetricSet(report.overall.B0)}`,
    `  C0 A0 + embedding RRF                   ${formatMetricSet(report.overall.C0)}`,
    `  C1 A1 + embedding RRF                   ${formatMetricSet(report.overall.C1)}`,
    "",
    `By category (${wiringOnly})`,
  ];

  for (const category of EVAL_QUERY_CATEGORIES) {
    const slice = report.byCategory[category];
    lines.push(`  ${category}`);
    lines.push(`    A0  ${formatMetricSet(slice.A0)}`);
    lines.push(`    A1  ${formatMetricSet(slice.A1)}`);
    lines.push(`    B0  ${formatMetricSet(slice.B0)}`);
    lines.push(`    C0  ${formatMetricSet(slice.C0)}`);
    lines.push(`    C1  ${formatMetricSet(slice.C1)}`);
  }

  lines.push("", `Per query (top 5; ${wiringOnly})`);
  for (const query of report.queries) {
    lines.push(`  [${query.queryId}] ${query.text}`);
    lines.push(
      `    A0  ${formatMetricSet(query.A0.metrics)}  hits=${formatHits(
        query.A0.ranking.slice(0, 5).map(hit => hit.clipId)
      )}`
    );
    lines.push(
      `    A1  ${formatMetricSet(query.A1.metrics)}  hits=${formatHits(
        query.A1.ranking.slice(0, 5).map(hit => hit.clipId)
      )}`
    );
    lines.push(
      `    B0  ${formatMetricSet(query.B0.metrics)}  hits=${formatHits(
        query.B0.ranking.slice(0, 5).map(hit => hit.clipId)
      )}`
    );
    lines.push(
      `    C0  ${formatMetricSet(query.C0.metrics)}  hits=${formatHits(
        query.C0.ranking.slice(0, 5).map(hit => hit.clipId)
      )}`
    );
    lines.push(
      `    C1  ${formatMetricSet(query.C1.metrics)}  hits=${formatHits(
        query.C1.ranking.slice(0, 5).map(hit => hit.clipId)
      )}`
    );
  }

  return lines.join("\n");
}
