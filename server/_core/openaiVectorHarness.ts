import "dotenv/config";

import { loadExampleEvalGold } from "../evalGold";
import {
  REAL_VECTOR_HARNESS_DISCLAIMER,
  formatEvalReport,
  runOfflineRetrievalEval,
} from "../evalRetrieval";
import {
  OPENAI_EMBEDDING_NATIVE_DIMENSION,
  createOpenAiEmbeddingProvider,
} from "./openaiEmbeddingProvider";
import { QWEN_REAL_SMOKE_STATUS } from "./qwenEmbeddingProvider";

async function main() {
  const gold = loadExampleEvalGold();
  const provider = createOpenAiEmbeddingProvider(
    OPENAI_EMBEDDING_NATIVE_DIMENSION
  );
  console.log("M5A real-vector harness validation");
  console.log(REAL_VECTOR_HARNESS_DISCLAIMER);
  console.log(`Qwen real smoke: ${QWEN_REAL_SMOKE_STATUS}`);
  console.log("No Qwen request sent. No provider fallback.");
  console.log(
    `clips: ${gold.clips.length}  queries: ${gold.queries.length} (example harness gold, not a quality set)`
  );

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
  console.log(formatEvalReport(report));
  console.log(
    "Stopped. Numbers above are harness wiring only. Do not choose a model from them."
  );
}

void main();
