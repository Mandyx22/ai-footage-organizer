import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./embeddingProvider";

export const FAKE_EMBEDDING_PROVIDER_ID = "fake";
export const FAKE_EMBEDDING_MODEL = "fake-deterministic-v1";
export const FAKE_EMBEDDING_DIMENSION = 8;
export const FAKE_PROVIDER_DISCLAIMER =
  "fake provider — harness validation only";

function hashEmbed(text: string, dimension: number): number[] {
  const vector: number[] = [];
  let block = text;
  while (vector.length < dimension) {
    const digest = createHash("sha256").update(block, "utf8").digest();
    for (
      let offset = 0;
      offset + 4 <= digest.length && vector.length < dimension;
      offset += 4
    ) {
      vector.push(digest.readUInt32BE(offset) / 0x80000000 - 1);
    }
    block = digest.toString("hex");
  }
  return vector;
}

export function createFakeEmbeddingProvider(
  dimension = FAKE_EMBEDDING_DIMENSION
): EmbeddingProvider {
  return {
    id: FAKE_EMBEDDING_PROVIDER_ID,
    model: FAKE_EMBEDDING_MODEL,
    dimension,
    async embedDocuments(texts) {
      return texts.map(text => hashEmbed(text, dimension));
    },
    async embedQuery(text) {
      return hashEmbed(text, dimension);
    },
  };
}
