export type EmbeddingProvider = {
  readonly id: string;
  readonly model: string;
  readonly dimension: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
};
