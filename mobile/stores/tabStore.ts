import { create } from "zustand";

let globalPagerRef: any = null;

export const registerPagerRef = (ref: any) => {
  globalPagerRef = ref;
};

export const setPagerScrollEnabledDirect = (enabled: boolean) => {
  try {
    globalPagerRef?.setNativeProps?.({ scrollEnabled: enabled });
  } catch {}
};

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
  setPagerScrollEnabled: (enabled: boolean) => {
    setPagerScrollEnabledDirect(enabled);
    set((state) => (state.pagerScrollEnabled !== enabled ? { pagerScrollEnabled: enabled } : state));
  },
  scrollToTab: (index: number) => set({ targetTabIndex: index, activeTabIndex: index }),
  clearTargetTab: () => set({ targetTabIndex: null }),
}));
