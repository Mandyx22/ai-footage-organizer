import { ENV } from "./env";
import { assertDenseVector, type EmbeddingProvider } from "./embeddingProvider";

export const QWEN_EMBEDDING_PROVIDER_ID = "qwen";
export const QWEN_EMBEDDING_MODEL = "text-embedding-v4";
export const QWEN_EMBEDDING_DIMENSION = 1024;
export const QWEN_REAL_SMOKE_STATUS =
  "blocked by credential type — existing key is Token Plan sk-sp";
const QWEN_EMBEDDING_BATCH_SIZE = 10;
export const QWEN_EMBEDDING_DEFAULT_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding";

type QwenEmbeddingItem = {
  embedding?: number[];
  text_index?: number;
};

type QwenEmbeddingResponse = {
  code?: string;
  message?: string;
  status_code?: number;
  output?: {
    embeddings?: QwenEmbeddingItem[];
  };
};

export function resolveQwenEmbeddingUrl(
  configuredBaseUrl: string,
  isProduction: boolean
) {
  const configured = configuredBaseUrl.trim().replace(/\/+$/, "");
  if (!configured) {
    if (isProduction) {
      throw new Error("QWEN_BASE_URL is required in production");
    }
    return QWEN_EMBEDDING_DEFAULT_URL;
  }
  if (
    configured.includes("/services/embeddings/text-embedding/text-embedding")
  ) {
    return configured;
  }
  const origin = configured
    .replace(/\/compatible-mode\/v1$/, "")
    .replace(/\/api\/v1$/, "");
  return `${origin}/api/v1/services/embeddings/text-embedding/text-embedding`;
}

function assertQwenApiKey() {
  if (!ENV.qwenApiKey) {
    throw new Error("DASHSCOPE_API_KEY is not configured");
  }
}

async function embedTexts(
  texts: string[],
  textType: "document" | "query"
): Promise<number[][]> {
  if (texts.length === 0) return [];
  assertQwenApiKey();
  const url = resolveQwenEmbeddingUrl(ENV.qwenBaseUrl, ENV.isProduction);
  const vectors: number[][] = [];

  for (
    let start = 0;
    start < texts.length;
    start += QWEN_EMBEDDING_BATCH_SIZE
  ) {
    const batch = texts.slice(start, start + QWEN_EMBEDDING_BATCH_SIZE);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.qwenApiKey}`,
      },
      body: JSON.stringify({
        model: QWEN_EMBEDDING_MODEL,
        input: { texts: batch },
        parameters: {
          text_type: textType,
          dimension: QWEN_EMBEDDING_DIMENSION,
        },
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `Qwen embedding failed: ${response.status} ${response.statusText} endpoint=${url} model=${QWEN_EMBEDDING_MODEL} - ${raw}`
      );
    }
    let result: QwenEmbeddingResponse;
    try {
      result = JSON.parse(raw) as QwenEmbeddingResponse;
    } catch {
      throw new Error(
        `Qwen embedding returned non-JSON endpoint=${url} model=${QWEN_EMBEDDING_MODEL} - ${raw}`
      );
    }
    if (typeof result.code === "string" && result.code.length > 0) {
      throw new Error(
        `Qwen embedding failed: ${result.code} endpoint=${url} model=${QWEN_EMBEDDING_MODEL} - ${result.message ?? raw}`
      );
    }
    if (typeof result.status_code === "number" && result.status_code !== 200) {
      throw new Error(
        `Qwen embedding failed: status_code=${result.status_code} endpoint=${url} model=${QWEN_EMBEDDING_MODEL} - ${result.message ?? raw}`
      );
    }
    const items = result.output?.embeddings;
    if (!items || items.length !== batch.length) {
      throw new Error(
        `Qwen embedding returned ${items?.length ?? 0} vectors for ${batch.length} inputs endpoint=${url} model=${QWEN_EMBEDDING_MODEL}`
      );
    }
    const ordered = [...items].sort(
      (left, right) => (left.text_index ?? 0) - (right.text_index ?? 0)
    );
    for (let index = 0; index < ordered.length; index++) {
      vectors.push(
        assertDenseVector(
          ordered[index]?.embedding,
          QWEN_EMBEDDING_DIMENSION,
          `Qwen ${textType} embedding[${start + index}]`
        )
      );
    }
  }

  return vectors;
}

export function createQwenEmbeddingProvider(): EmbeddingProvider {
  return {
    id: QWEN_EMBEDDING_PROVIDER_ID,
    model: QWEN_EMBEDDING_MODEL,
    dimension: QWEN_EMBEDDING_DIMENSION,
    embedDocuments(texts) {
      return embedTexts(texts, "document");
    },
    async embedQuery(text) {
      const [vector] = await embedTexts([text], "query");
      if (!vector) {
        throw new Error("Qwen embedding returned no query vector");
      }
      return vector;
    },
  };
}
