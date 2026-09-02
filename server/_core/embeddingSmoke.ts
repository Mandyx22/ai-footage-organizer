import "dotenv/config";

import {
  CANONICAL_TEXT_VERSION,
  buildCanonicalEmbeddingText,
} from "../canonicalText";
import { loadExampleEvalGold } from "../evalGold";
import { embeddingIndexKey } from "./embeddingProvider";
import {
  OPENAI_EMBEDDING_NATIVE_DIMENSION,
  OPENAI_EMBEDDINGS_URL,
  createOpenAiEmbeddingProvider,
} from "./openaiEmbeddingProvider";
import {
  createQwenEmbeddingProvider,
  resolveQwenEmbeddingUrl,
} from "./qwenEmbeddingProvider";
import { ENV } from "./env";

function inspectVector(
  label: string,
  vector: number[],
  expectedDimension: number
) {
  if (vector.length === 0) {
    throw new Error(`${label}: empty vector`);
  }
  if (vector.length !== expectedDimension) {
    throw new Error(
      `${label}: expected ${expectedDimension}-d vector, got ${vector.length}`
    );
  }
  if (!vector.every(value => Number.isFinite(value))) {
    throw new Error(`${label}: embedding contains a non-finite value`);
  }
  const absMax = Math.max(...vector.map(value => Math.abs(value)));
  console.log(
    `${label}: dim=${vector.length} finite=true empty=false absMax=${absMax.toExponential(3)} (values omitted)`
  );
}

async function smokeProvider(
  name: string,
  endpoint: string,
  provider: ReturnType<typeof createQwenEmbeddingProvider>,
  document: string,
  query: string
) {
  console.log(`\n=== ${name} ===`);
  console.log(`endpoint: ${endpoint}`);
  console.log(`model: ${provider.model}`);
  console.log(`declared dimension: ${provider.dimension}`);
  console.log(
    `index key: ${embeddingIndexKey(provider, CANONICAL_TEXT_VERSION)}`
  );
  const documents = await provider.embedDocuments([document]);
  const queryVector = await provider.embedQuery(query);
  inspectVector("document", documents[0] ?? [], provider.dimension);
  inspectVector("query", queryVector, provider.dimension);
  console.log("smoke ok");
}

async function main() {
  const gold = loadExampleEvalGold();
  const clip = gold.clips.find(item => item.id === "demo-104");
  const query = gold.queries.find(item => item.id === "q-quiet-blue-night");
  if (!clip || !query) {
    throw new Error("eval gold is missing demo-104 / q-quiet-blue-night");
  }
  const document = buildCanonicalEmbeddingText(clip.metadataV2);
  console.log("M5A embedding smoke: 1 clip document + 1 query per provider.");
  console.log(
    "This is connectivity/shape only. Do not judge retrieval quality."
  );
  console.log(`clip: ${clip.id}`);
  console.log(`query: ${query.text}`);
  console.log(`canonicalTextVersion: ${CANONICAL_TEXT_VERSION}`);
  console.log(`document chars: ${document.length}`);

  const failures: string[] = [];

  try {
    const qwen = createQwenEmbeddingProvider();
    await smokeProvider(
      "Qwen text-embedding-v4",
      resolveQwenEmbeddingUrl(ENV.qwenBaseUrl, ENV.isProduction),
      qwen,
      document,
      query.text
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Qwen text-embedding-v4: ${message}`);
    console.error(`SMOKE FAILED Qwen text-embedding-v4: ${message}`);
  }

  try {
    const openai = createOpenAiEmbeddingProvider(
      OPENAI_EMBEDDING_NATIVE_DIMENSION
    );
    await smokeProvider(
      "OpenAI text-embedding-3-large native 3072",
      OPENAI_EMBEDDINGS_URL,
      openai,
      document,
      query.text
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`OpenAI text-embedding-3-large: ${message}`);
    console.error(`SMOKE FAILED OpenAI text-embedding-3-large: ${message}`);
  }

  if (failures.length > 0) {
    console.error("\nStopped. No model fallback was applied.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

void main();
