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

export function getMyLibraryPresentation<T>(response: LibraryResponse<T>, justUploaded = false) {
  const source = getScopedLibrarySource(response, "personal");
  return {
    ...source,
    showUploadConfirmation: justUploaded && source.clips.length > 0,
  };
}
