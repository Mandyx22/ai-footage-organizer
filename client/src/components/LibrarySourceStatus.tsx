import React from "react";

export function LibrarySourceStatus({ mode }: { mode: "personal" | "sample" }) {
  return <p data-testid={`library-source-${mode}`} className="font-mono text-[10px] uppercase tracking-[.17em] ink-muted">
    {mode === "personal" ? "My Library · private workspace" : "Sample content · read-only · fictional clips"}
  </p>;
}
