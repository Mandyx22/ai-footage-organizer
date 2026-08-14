import React from "react";
import type { UploadJob } from "@/lib/footage";
import { AlertCircle } from "lucide-react";
import { UploadHandoffAction } from "./UploadHandoffAction";

export function UploadResultSummary({ jobs, showLibraryAction, onOpenLibrary }: { jobs: UploadJob[]; showLibraryAction: boolean; onOpenLibrary: () => void }) {
  const failed = jobs.filter(job => job.state === "failed");
  if (!failed.length && !showLibraryAction) return null;
  return <div data-testid="upload-result-summary" className="mt-4 space-y-2">
    {failed.length > 0 && <div data-testid="mixed-upload-failures" className="rounded-xl border-[1.5px] border-[#b75252]/45 bg-[#fff0ee] px-3 py-2.5 text-xs text-[#722b2b]"><div className="flex items-center gap-1.5 font-semibold"><AlertCircle className="size-3.5" />{failed.length} clip{failed.length === 1 ? " needs" : "s need"} another try</div><p className="mt-1.5 leading-5">{failed.map(job => job.fileName).join(", ")} {failed.length === 1 ? "remains visible above with its error." : "remain visible above with their errors."}</p></div>}
    <UploadHandoffAction visible={showLibraryAction} onOpen={onOpenLibrary} />
  </div>;
}
