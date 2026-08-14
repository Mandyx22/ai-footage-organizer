import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LibrarySourceStatus } from "./LibrarySourceStatus";
import { UploadHandoffAction } from "./UploadHandoffAction";
import { UploadHandoffNotice } from "./UploadHandoffNotice";
import { UploadResultSummary } from "./UploadResultSummary";

describe("personal-library handoff rendered output", () => {
  it("renders distinct personal and read-only sample source labels", () => {
    const personal = renderToStaticMarkup(<LibrarySourceStatus mode="personal" />);
    const sample = renderToStaticMarkup(<LibrarySourceStatus mode="sample" />);

    expect(personal).toContain("My Library · private workspace");
    expect(sample).toContain("Sample content · read-only · fictional clips");
  });

  it("renders a My Library handoff only after refreshed personal data confirms an upload", () => {
    const notice = renderToStaticMarkup(<UploadHandoffNotice visible />);
    const hiddenNotice = renderToStaticMarkup(<UploadHandoffNotice visible={false} />);
    const action = renderToStaticMarkup(<UploadHandoffAction visible onOpen={vi.fn()} />);

    expect(notice).toContain("Your upload is ready.");
    expect(hiddenNotice).toBe("");
    expect(action).toContain("Open My Library");
  });

  it("keeps failed uploads visible while offering My Library for clips that succeeded", () => {
    const mixed = renderToStaticMarkup(<UploadResultSummary showLibraryAction onOpenLibrary={vi.fn()} jobs={[{ id: "ready", fileName: "ready.mov", progress: 100, state: "ready" }, { id: "failed", fileName: "failed.mov", progress: 100, state: "failed", error: "Prototype upload limit is 50 MB per clip." }]} />);

    expect(mixed).toContain("1 clip needs another try");
    expect(mixed).toContain("failed.mov");
    expect(mixed).toContain("Open My Library");
  });
});
