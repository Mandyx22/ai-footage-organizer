export function getUploadOutcome(total: number, succeeded: number) {
  const failed = Math.max(0, total - succeeded);
  return {
    succeeded,
    failed,
    shouldAutoNavigate: total > 0 && succeeded === total,
    shouldOfferLibraryAction: succeeded > 0,
    message: failed > 0
      ? `${succeeded} clip${succeeded === 1 ? " is" : "s are"} ready in My Library; ${failed} needs another try.`
      : `${succeeded} clip${succeeded === 1 ? " is" : "s are"} ready in My Library.`,
  };
}

export async function refreshPersonalFootageQueries(invalidate: {
  personalList: () => Promise<unknown>;
  personalSearch: () => Promise<unknown>;
  personalSimilar: () => Promise<unknown>;
}) {
  await Promise.all([
    invalidate.personalList(),
    invalidate.personalSearch(),
    invalidate.personalSimilar(),
  ]);
}

export async function discardFailedTemporaryClip(clipId: number | null, deleteClip: (clipId: number) => Promise<unknown>) {
  if (!clipId) return false;
  try {
    await deleteClip(clipId);
    return true;
  } catch {
    return false;
  }
}

export async function finalizeUploadCompletion({
  total,
  succeeded,
  refreshPersonalFootage,
}: {
  total: number;
  succeeded: number;
  refreshPersonalFootage: () => Promise<unknown>;
}) {
  const outcome = getUploadOutcome(total, succeeded);
  if (outcome.shouldOfferLibraryAction) await refreshPersonalFootage();
  return outcome;
}

export function getPostUploadDestination(outcome: { shouldAutoNavigate: boolean }) {
  return outcome.shouldAutoNavigate ? "/my-library?uploaded=1" : null;
}
