export type LibraryMode = "personal" | "sample";

type LibraryResponse<T> = { mode?: string; clips?: T[] } | undefined;

export function getScopedLibrarySource<T>(response: LibraryResponse<T>, expectedMode: LibraryMode) {
  const isExpectedSource = response?.mode === expectedMode;
  return {
    mode: expectedMode,
    clips: isExpectedSource ? response?.clips ?? [] : [],
    isExpectedSource,
  };
}
