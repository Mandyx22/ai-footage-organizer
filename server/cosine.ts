export function l2Normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return vector.map(() => 0);
  return vector.map(value => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`
    );
  }
  const left = l2Normalize(a);
  const right = l2Normalize(b);
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }
  return dot;
}

export type CosineRankedId = {
  id: string;
  cosine: number;
};

export function rankByCosine(
  queryVector: number[],
  items: Array<{ id: string; vector: number[] }>
): CosineRankedId[] {
  return items
    .map(item => ({
      id: item.id,
      cosine: cosineSimilarity(queryVector, item.vector),
    }))
    .sort((left, right) => {
      if (right.cosine !== left.cosine) return right.cosine - left.cosine;
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    });
}
