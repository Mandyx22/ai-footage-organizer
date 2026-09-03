export type MetricSet = {
  recallAt5: number;
  recallAt10: number;
  successAt5: number;
  ndcgAt10: number;
};

export function relevantClipIds(
  judgments: Array<{ clipId: string; grade: number }>
): Set<string> {
  return new Set(
    judgments
      .filter(judgment => judgment.grade >= 1)
      .map(judgment => judgment.clipId)
  );
}

export function gradeMap(
  judgments: Array<{ clipId: string; grade: number }>
): Map<string, number> {
  return new Map(judgments.map(judgment => [judgment.clipId, judgment.grade]));
}

export function recallAtK(
  rankedIds: string[],
  relevantIds: Set<string>,
  k: number
): number {
  if (relevantIds.size === 0) return 0;
  const hits = rankedIds.slice(0, k).filter(id => relevantIds.has(id)).length;
  return hits / relevantIds.size;
}

export function successAtK(
  rankedIds: string[],
  relevantIds: Set<string>,
  k: number
): number {
  if (relevantIds.size === 0) return 0;
  return rankedIds.slice(0, k).some(id => relevantIds.has(id)) ? 1 : 0;
}

function dcgAtK(
  rankedIds: string[],
  grades: Map<string, number>,
  k: number
): number {
  return rankedIds.slice(0, k).reduce((sum, id, index) => {
    const gain = 2 ** (grades.get(id) ?? 0) - 1;
    return sum + gain / Math.log2(index + 2);
  }, 0);
}

export function ndcgAtK(
  rankedIds: string[],
  grades: Map<string, number>,
  k: number
): number {
  const dcg = dcgAtK(rankedIds, grades, k);
  const idealIds = Array.from(grades.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
    })
    .map(([id]) => id);
  const idcg = dcgAtK(idealIds, grades, k);
  if (idcg === 0) return 0;
  return dcg / idcg;
}

export function metricsForRanking(
  rankedIds: string[],
  judgments: Array<{ clipId: string; grade: number }>
): MetricSet {
  const relevant = relevantClipIds(judgments);
  const grades = gradeMap(judgments);
  return {
    recallAt5: recallAtK(rankedIds, relevant, 5),
    recallAt10: recallAtK(rankedIds, relevant, 10),
    successAt5: successAtK(rankedIds, relevant, 5),
    ndcgAt10: ndcgAtK(rankedIds, grades, 10),
  };
}

export function meanMetricSet(sets: MetricSet[]): MetricSet {
  if (sets.length === 0) {
    return { recallAt5: 0, recallAt10: 0, successAt5: 0, ndcgAt10: 0 };
  }
  const total = sets.reduce(
    (sum, set) => ({
      recallAt5: sum.recallAt5 + set.recallAt5,
      recallAt10: sum.recallAt10 + set.recallAt10,
      successAt5: sum.successAt5 + set.successAt5,
      ndcgAt10: sum.ndcgAt10 + set.ndcgAt10,
    }),
    { recallAt5: 0, recallAt10: 0, successAt5: 0, ndcgAt10: 0 }
  );
  return {
    recallAt5: total.recallAt5 / sets.length,
    recallAt10: total.recallAt10 / sets.length,
    successAt5: total.successAt5 / sets.length,
    ndcgAt10: total.ndcgAt10 / sets.length,
  };
}
