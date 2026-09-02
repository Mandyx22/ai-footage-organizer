import { ENV } from "./env";
import { assertDenseVector, type EmbeddingProvider } from "./embeddingProvider";

export const OPENAI_EMBEDDING_PROVIDER_ID = "openai";
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-large";
export const OPENAI_EMBEDDING_NATIVE_DIMENSION = 3072;
export const OPENAI_EMBEDDING_COMPARISON_DIMENSION = 1024;
export const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

export type OpenAiEmbeddingDimension =
  | typeof OPENAI_EMBEDDING_NATIVE_DIMENSION
  | typeof OPENAI_EMBEDDING_COMPARISON_DIMENSION;

type OpenAiEmbeddingItem = {
  embedding?: number[];
  index?: number;
};

type OpenAiEmbeddingResponse = {
  data?: OpenAiEmbeddingItem[];
};

function assertOpenAiApiKey() {
  if (!ENV.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

export function createOpenAiEmbeddingProvider(
  dimension: OpenAiEmbeddingDimension = OPENAI_EMBEDDING_NATIVE_DIMENSION
): EmbeddingProvider {
  return {
    id: OPENAI_EMBEDDING_PROVIDER_ID,
    model: OPENAI_EMBEDDING_MODEL,
    dimension,
    async embedDocuments(texts) {
      return embedTexts(texts, dimension);
    },
    async embedQuery(text) {
      const [vector] = await embedTexts([text], dimension);
      if (!vector) {
        throw new Error("OpenAI embedding returned no query vector");
      }
      return vector;
    },
  };
}

async function embedTexts(
  texts: string[],
  dimension: OpenAiEmbeddingDimension
): Promise<number[][]> {
  if (texts.length === 0) return [];
  assertOpenAiApiKey();
  const body: Record<string, unknown> = {
    model: OPENAI_EMBEDDING_MODEL,
    input: texts,
    encoding_format: "float",
  };
  if (dimension !== OPENAI_EMBEDDING_NATIVE_DIMENSION) {
    body.dimensions = dimension;
  }
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openAiApiKey}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenAI embedding failed: ${response.status} ${response.statusText} endpoint=${OPENAI_EMBEDDINGS_URL} model=${OPENAI_EMBEDDING_MODEL} - ${raw}`
    );
  }
  let result: OpenAiEmbeddingResponse;
  try {
    result = JSON.parse(raw) as OpenAiEmbeddingResponse;
  } catch {
    throw new Error(
      `OpenAI embedding returned non-JSON endpoint=${OPENAI_EMBEDDINGS_URL} model=${OPENAI_EMBEDDING_MODEL} - ${raw}`
    );
  }
  const items = result.data;
  if (!items || items.length !== texts.length) {
    throw new Error(
      `OpenAI embedding returned ${items?.length ?? 0} vectors for ${texts.length} inputs endpoint=${OPENAI_EMBEDDINGS_URL} model=${OPENAI_EMBEDDING_MODEL}`
    );
  }
  return [...items]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item, index) =>
      assertDenseVector(item.embedding, dimension, `OpenAI embedding[${index}]`)
    );
}
