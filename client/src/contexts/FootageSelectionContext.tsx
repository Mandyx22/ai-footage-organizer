import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type FootageSelectionState = {
  selectedIds: number[];
  toggleSelection: (id: number) => void;
  clearSelection: () => void;
  isSelected: (id: number) => boolean;
};

const FootageSelectionContext = createContext<FootageSelectionState | null>(null);

export function FootageSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const value = useMemo<FootageSelectionState>(() => ({
    selectedIds,
    toggleSelection: (id) => setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]),
    clearSelection: () => setSelectedIds([]),
    isSelected: (id) => selectedIds.includes(id),
  }), [selectedIds]);
  return <FootageSelectionContext.Provider value={value}>{children}</FootageSelectionContext.Provider>;
}

export function useFootageSelection() {
  const context = useContext(FootageSelectionContext);
  if (!context) throw new Error("useFootageSelection must be used within FootageSelectionProvider");
  return context;
}
