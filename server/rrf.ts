export const RRF_K = 60;
export const RRF_CANDIDATE_K = 50;

export type RrfRankedId = {
  id: string;
  score: number;
};

export function rrfFuse(rankings: string[][], k = RRF_K): RrfRankedId[] {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    ranking.slice(0, RRF_CANDIDATE_K).forEach((id, index) => {
      const rank = index + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    });
}
