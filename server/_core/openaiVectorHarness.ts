import "dotenv/config";

import { loadExampleEvalGold } from "../evalGold";
import {
  REAL_VECTOR_HARNESS_DISCLAIMER,
  runOfflineRetrievalEval,
  type OfflineEvalReport,
} from "../evalRetrieval";
import {
  OPENAI_EMBEDDING_NATIVE_DIMENSION,
  createOpenAiEmbeddingProvider,
} from "./openaiEmbeddingProvider";

function printPlumbingSummary(report: OfflineEvalReport) {
  const rankingLengths = report.queries.map(
    query =>
      `${query.queryId}: A0=${query.A0.ranking.length} A1=${query.A1.ranking.length} B0=${query.B0.ranking.length} C0=${query.C0.ranking.length} C1=${query.C1.ranking.length}`
  );
  console.log(report.disclaimer);
  console.log(
    `provider: ${report.provider.id} / ${report.provider.model} / dim=${report.provider.dimension}`
  );
  console.log(`index key: ${report.indexKey}`);
  console.log(
    `clips: ${report.clipCount}  queries: ${report.queryCount} (example harness gold, not a quality set)`
  );
  console.log("ranking lengths");
  for (const line of rankingLengths) {
    console.log(`  ${line}`);
  }
  console.log("pipeline: A0 A1 B0 C0 C1 completed");
}

async function main() {
  const gold = loadExampleEvalGold();
  const provider = createOpenAiEmbeddingProvider(
    OPENAI_EMBEDDING_NATIVE_DIMENSION
  );
  console.log("M5A real-vector harness validation");
  console.log(REAL_VECTOR_HARNESS_DISCLAIMER);
  console.log("Qwen is not enabled for this real-vector harness batch");
  console.log("No Qwen request sent. No provider fallback.");

  const report = await runOfflineRetrievalEval({ gold, provider });
  if (report.provider.dimension !== OPENAI_EMBEDDING_NATIVE_DIMENSION) {
    throw new Error(
      `expected OpenAI native ${OPENAI_EMBEDDING_NATIVE_DIMENSION}-d vectors`
    );
  }
  for (const query of report.queries) {
    if (query.B0.ranking.length !== report.clipCount) {
      throw new Error(
        `${query.queryId}: B0 ranking length ${query.B0.ranking.length} != ${report.clipCount}`
      );
    }
  }
  printPlumbingSummary(report);
  console.log(
    "Stopped. Plumbing summary only. Metrics were computed but not printed; do not choose a model from this run."
  );
}

void main();
