import {
  buildCanonicalEmbeddingText,
  CANONICAL_TEXT_VERSION,
} from "./canonicalText";
import { rankByCosine } from "./cosine";
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
import type { EmbeddingProvider } from "./_core/embeddingProvider";
import {
  createFakeEmbeddingProvider,
  FAKE_PROVIDER_DISCLAIMER,
} from "./_core/fakeEmbeddingProvider";

export const HARNESS_NOTE =
  "Metrics validate the harness pipeline. They are not retrieval-quality evidence.";

export type LexicalRankedHit = {
  clipId: string;
  score: number;
  reasons: string[];
};

export type SemanticRankedHit = {
  clipId: string;
  cosine: number;
};

export type QueryEvalResult = {
  queryId: string;
  text: string;
  language: string;
  categories: EvalQueryCategory[];
  A0: {
    ranking: LexicalRankedHit[];
    metrics: MetricSet;
  };
  B0: {
    ranking: SemanticRankedHit[];
    metrics: MetricSet;
  };
};

export type OfflineEvalReport = {
  disclaimer: typeof FAKE_PROVIDER_DISCLAIMER;
  note: typeof HARNESS_NOTE;
  provider: {
    id: string;
    model: string;
    dimension: number;
  };
  canonicalTextVersion: typeof CANONICAL_TEXT_VERSION;
  clipCount: number;
  queryCount: number;
  overall: {
    A0: MetricSet;
    B0: MetricSet;
  };
  byCategory: Record<EvalQueryCategory, { A0: MetricSet; B0: MetricSet }>;
  queries: QueryEvalResult[];
};

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

export async function runOfflineRetrievalEval(options: {
  gold: EvalGoldSet;
  provider: EmbeddingProvider;
}): Promise<OfflineEvalReport> {
  const { gold, provider } = options;
  if (provider.id !== "fake") {
    throw new Error(
      "This M5A harness batch only runs the fake EmbeddingProvider"
    );
  }

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
    const lexical = rankFootage(footageClips, query.text).map(item => ({
      clipId: evalIdByNumericId.get(item.clip.id) ?? String(item.clip.id),
      score: item.score,
      reasons: item.reasons,
    }));

    const queryVector = await provider.embedQuery(query.text);
    const semantic = rankByCosine(
      queryVector,
      gold.clips.map((clip, index) => ({
        id: clip.id,
        vector: documentVectors[index],
      }))
    );

    queries.push({
      queryId: query.id,
      text: query.text,
      language: query.language,
      categories: query.categories,
      A0: {
        ranking: lexical,
        metrics: metricsForRanking(
          lexical.map(hit => hit.clipId),
          query.judgments
        ),
      },
      B0: {
        ranking: semantic.map(hit => ({
          clipId: hit.id,
          cosine: hit.cosine,
        })),
        metrics: metricsForRanking(
          semantic.map(hit => hit.id),
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
      return [
        category,
        {
          A0: meanMetricSet(slice.map(query => query.A0.metrics)),
          B0: meanMetricSet(slice.map(query => query.B0.metrics)),
        },
      ];
    })
  ) as OfflineEvalReport["byCategory"];

  return {
    disclaimer: FAKE_PROVIDER_DISCLAIMER,
    note: HARNESS_NOTE,
    provider: {
      id: provider.id,
      model: provider.model,
      dimension: provider.dimension,
    },
    canonicalTextVersion: CANONICAL_TEXT_VERSION,
    clipCount: gold.clips.length,
    queryCount: gold.queries.length,
    overall: {
      A0: meanMetricSet(queries.map(query => query.A0.metrics)),
      B0: meanMetricSet(queries.map(query => query.B0.metrics)),
    },
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

export function formatEvalReport(report: OfflineEvalReport): string {
  const lines = [
    "Framefind M5A offline retrieval eval",
    report.disclaimer,
    report.note,
    `provider: ${report.provider.id} / ${report.provider.model} / dim=${report.provider.dimension}`,
    `canonicalTextVersion: ${report.canonicalTextVersion}`,
    `clips: ${report.clipCount}  queries: ${report.queryCount}`,
    "",
    "Overall",
    `  A0 lexical            ${formatMetricSet(report.overall.A0)}`,
    `  B0 embedding (fake)   ${formatMetricSet(report.overall.B0)}`,
    "",
    "By category",
  ];

  for (const category of EVAL_QUERY_CATEGORIES) {
    const slice = report.byCategory[category];
    lines.push(`  ${category}`);
    lines.push(`    A0  ${formatMetricSet(slice.A0)}`);
    lines.push(`    B0  ${formatMetricSet(slice.B0)}`);
  }

  lines.push("", "Per query (top 5)");
  for (const query of report.queries) {
    lines.push(`  [${query.queryId}] ${query.text}`);
    lines.push(
      `    A0  ${formatMetricSet(query.A0.metrics)}  hits=${
        query.A0.ranking
          .slice(0, 5)
          .map(hit => hit.clipId)
          .join(",") || "(none)"
      }`
    );
    lines.push(
      `    B0  ${formatMetricSet(query.B0.metrics)}  hits=${query.B0.ranking
        .slice(0, 5)
        .map(hit => hit.clipId)
        .join(",")}`
    );
  }

  return lines.join("\n");
}
