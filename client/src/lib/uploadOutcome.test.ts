import { describe, expect, it, vi } from "vitest";
import { finalizeUploadCompletion, getPostUploadDestination, getUploadOutcome, refreshPersonalFootageQueries } from "./uploadOutcome";

describe("upload completion outcome", () => {
  it("auto-navigates only if every selected clip reaches My Library", () => {
    expect(getUploadOutcome(2, 2)).toMatchObject({ shouldAutoNavigate: true, shouldOfferLibraryAction: true, failed: 0 });
    expect(getUploadOutcome(3, 2)).toMatchObject({ shouldAutoNavigate: false, shouldOfferLibraryAction: true, failed: 1 });
  });

  it("does not offer a personal-library action when every upload fails", () => {
    expect(getUploadOutcome(2, 0)).toMatchObject({ shouldAutoNavigate: false, shouldOfferLibraryAction: false, failed: 2 });
  });

  it("refreshes only My Library queries after a successful media save", async () => {
    const personalList = vi.fn(async () => undefined);
    const personalSearch = vi.fn(async () => undefined);
    const personalSimilar = vi.fn(async () => undefined);

    await refreshPersonalFootageQueries({ personalList, personalSearch, personalSimilar });

    expect(personalList).toHaveBeenCalledOnce();
    expect(personalSearch).toHaveBeenCalledOnce();
    expect(personalSimilar).toHaveBeenCalledOnce();
  });

  it("orchestrates refresh and navigation policy after upload completion", async () => {
    const refreshPersonalFootage = vi.fn(async () => undefined);

    const allSucceeded = await finalizeUploadCompletion({ total: 2, succeeded: 2, refreshPersonalFootage });
    const mixedResult = await finalizeUploadCompletion({ total: 3, succeeded: 2, refreshPersonalFootage });
    const allFailed = await finalizeUploadCompletion({ total: 2, succeeded: 0, refreshPersonalFootage });

    expect(refreshPersonalFootage).toHaveBeenCalledTimes(2);
    expect(allSucceeded.shouldAutoNavigate).toBe(true);
    expect(mixedResult).toMatchObject({ shouldAutoNavigate: false, shouldOfferLibraryAction: true });
    expect(allFailed.shouldOfferLibraryAction).toBe(false);
    expect(getPostUploadDestination(allSucceeded)).toBe("/my-library?uploaded=1");
    expect(getPostUploadDestination(mixedResult)).toBeNull();
  });
});
