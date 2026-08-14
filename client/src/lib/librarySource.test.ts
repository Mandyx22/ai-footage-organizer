import { describe, expect, it } from "vitest";
import { getMyLibraryPresentation, getScopedLibrarySource } from "./librarySource";

describe("scoped library view source", () => {
  it("passes a newly uploaded personal clip through to the My Library view", () => {
    const uploadedClip = { id: 333, fileName: "my-upload.mov" };
    const source = getScopedLibrarySource({ mode: "personal", clips: [uploadedClip] }, "personal");

    expect(source).toMatchObject({ mode: "personal", isExpectedSource: true, clips: [uploadedClip] });
  });

  it("keeps sample and personal sources separate at the view boundary", () => {
    const sampleClip = { id: 101, fileName: "IMG_4821.MOV" };
    const sampleSource = getScopedLibrarySource({ mode: "sample", clips: [sampleClip] }, "sample");
    const personalSource = getScopedLibrarySource({ mode: "sample", clips: [sampleClip] }, "personal");

    expect(sampleSource.clips).toEqual([sampleClip]);
    expect(personalSource).toMatchObject({ mode: "personal", isExpectedSource: false, clips: [] });
  });

  it("shows the post-upload confirmation only when refreshed personal data contains the new clip", () => {
    const uploaded = { id: 333, fileName: "my-upload.mov" };
    expect(getMyLibraryPresentation({ mode: "personal", clips: [uploaded] }, true)).toMatchObject({ clips: [uploaded], showUploadConfirmation: true });
    expect(getMyLibraryPresentation({ mode: "sample", clips: [uploaded] }, true)).toMatchObject({ clips: [], showUploadConfirmation: false });
  });
});
