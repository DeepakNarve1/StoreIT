import { create } from "zustand";

interface SidebarState {
  isOpen: boolean;
  activeCategoryId: string | null;
  activeFolderId: string | null;
  toggle: () => void;
  setActiveCategory: (id: string | null) => void;
  setActiveFolder: (id: string | null) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: true,
  activeCategoryId: null,
  activeFolderId: null,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setActiveCategory: (id) => set({ activeCategoryId: id }),
  setActiveFolder: (id) => set({ activeFolderId: id }),
}));
