import { create } from "zustand";

export interface TabStoreState {
  activeTabIndex: number;
  pagerScrollEnabled: boolean;
  targetTabIndex: number | null;
  setActiveTabIndex: (index: number) => void;
  setPagerScrollEnabled: (enabled: boolean) => void;
  scrollToTab: (index: number) => void;
  clearTargetTab: () => void;
}

export const useTabStore = create<TabStoreState>((set) => ({
  activeTabIndex: 0,
  pagerScrollEnabled: true,
  targetTabIndex: null,
  setActiveTabIndex: (index: number) => set({ activeTabIndex: index }),
  setPagerScrollEnabled: (enabled: boolean) => set({ pagerScrollEnabled: enabled }),
  scrollToTab: (index: number) => set({ targetTabIndex: index, activeTabIndex: index }),
  clearTargetTab: () => set({ targetTabIndex: null }),
}));
