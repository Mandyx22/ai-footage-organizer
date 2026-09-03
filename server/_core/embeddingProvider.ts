export type EmbeddingProvider = {
  readonly id: string;
  readonly model: string;
  readonly dimension: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
};

export function embeddingIndexKey(
  provider: Pick<EmbeddingProvider, "id" | "model" | "dimension">,
  canonicalTextVersion: string
) {
  return `${provider.id}/${provider.model}/dim-${provider.dimension}/${canonicalTextVersion}`;
}

export function assertDenseVector(
  value: unknown,
  dimension: number,
  label: string
): number[] {
  if (!Array.isArray(value) || value.length !== dimension) {
    throw new Error(
      `${label}: expected ${dimension}-d vector, got ${Array.isArray(value) ? value.length : typeof value}`
    );
  }
  if (!value.every(item => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`${label}: embedding contains a non-finite value`);
  }
  return value;
}
