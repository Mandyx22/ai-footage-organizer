import { describe, expect, it } from "vitest";
import { assertDenseVector, embeddingIndexKey } from "./embeddingProvider";
import { CANONICAL_TEXT_VERSION } from "../canonicalText";
import {
  OPENAI_EMBEDDING_COMPARISON_DIMENSION,
  OPENAI_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_PROVIDER_ID,
} from "./openaiEmbeddingProvider";
import {
  QWEN_EMBEDDING_DIMENSION,
  QWEN_EMBEDDING_MODEL,
  QWEN_EMBEDDING_PROVIDER_ID,
} from "./qwenEmbeddingProvider";

describe("embedding isolation helpers", () => {
  it("keeps Qwen and OpenAI vectors in separate indexes even at the same dimension", () => {
    const qwenKey = embeddingIndexKey(
      {
        id: QWEN_EMBEDDING_PROVIDER_ID,
        model: QWEN_EMBEDDING_MODEL,
        dimension: QWEN_EMBEDDING_DIMENSION,
      },
      CANONICAL_TEXT_VERSION
    );
    const openaiKey = embeddingIndexKey(
      {
        id: OPENAI_EMBEDDING_PROVIDER_ID,
        model: OPENAI_EMBEDDING_MODEL,
        dimension: OPENAI_EMBEDDING_COMPARISON_DIMENSION,
      },
      CANONICAL_TEXT_VERSION
    );

    expect(qwenKey).toBe("qwen/text-embedding-v4/dim-1024/semantic-v1");
    expect(openaiKey).toBe(
      "openai/text-embedding-3-large/dim-1024/semantic-v1"
    );
    expect(qwenKey).not.toBe(openaiKey);
  });

  it("rejects non-finite or wrong-sized vectors", () => {
    expect(assertDenseVector([1, 2], 2, "ok")).toEqual([1, 2]);
    expect(() => assertDenseVector([1], 2, "short")).toThrow(/expected 2-d/);
    expect(() => assertDenseVector([1, Number.NaN], 2, "nan")).toThrow(
      /non-finite/
    );
  });
});
