import React from "react";
import { Button } from "@/components/ui/button";

export function UploadHandoffAction({ visible, onOpen }: { visible: boolean; onOpen: () => void }) {
  if (!visible) return null;
  return <Button onClick={onOpen} data-testid="open-my-library" className="mt-4 w-full rounded-xl border-[1.5px] border-[#2c2922] bg-[#dcefdc] text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#c8e5c8]">Open My Library</Button>;
}
