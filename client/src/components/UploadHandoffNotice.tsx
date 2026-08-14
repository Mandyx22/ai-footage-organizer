import React from "react";
import { Sparkles } from "lucide-react";

export function UploadHandoffNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <div data-testid="upload-handoff-notice" className="note-green mb-5 flex items-center gap-2 rounded-xl border-[1.5px] border-[#2c2922]/48 px-3 py-2.5 text-xs shadow-[2px_2px_0_rgba(44,41,34,.12)]"><Sparkles className="size-3.5 shrink-0" /><span><b>Your upload is ready.</b> It has been added below with its first visual notes.</span></div>;
}
