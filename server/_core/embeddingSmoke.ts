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
  QWEN_EMBEDDING_DEFAULT_URL,
  QWEN_EMBEDDING_MODEL,
} from "./qwenEmbeddingProvider";

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

async function smokeOpenAi(document: string, query: string) {
  const provider = createOpenAiEmbeddingProvider(
    OPENAI_EMBEDDING_NATIVE_DIMENSION
  );
  console.log("\n=== OpenAI text-embedding-3-large native 3072 ===");
  console.log(`endpoint: ${OPENAI_EMBEDDINGS_URL}`);
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
  console.log("M5A embedding smoke: 1 clip document + 1 query.");
  console.log(
    "This is connectivity/shape only. Do not judge retrieval quality."
  );
  console.log(`clip: ${clip.id}`);
  console.log(`query: ${query.text}`);
  console.log(`canonicalTextVersion: ${CANONICAL_TEXT_VERSION}`);
  console.log(`document chars: ${document.length}`);

  console.log("\n=== Qwen text-embedding-v4 ===");
  console.log(`intended endpoint: ${QWEN_EMBEDDING_DEFAULT_URL}`);
  console.log(`intended model: ${QWEN_EMBEDDING_MODEL}`);
  console.log(
    "Qwen real smoke skipped: blocked by credential type — existing key is Token Plan sk-sp"
  );
  console.log(
    "No Qwen request sent. No endpoint, model, or provider fallback."
  );

  await smokeOpenAi(document, query.text);
}

void main();
