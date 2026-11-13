import { create } from "zustand";
import { Dimensions } from "react-native";

let globalPagerRef: any = null;
let isProgrammaticScroll = false;
let scrollLockTimeout: any = null;

export const registerPagerRef = (ref: any) => {
  globalPagerRef = ref;
};

export const setPagerScrollEnabledDirect = (enabled: boolean) => {
  try {
    globalPagerRef?.setNativeProps?.({ scrollEnabled: enabled });
  } catch {}
};

export const isProgrammaticTabScroll = () => isProgrammaticScroll;

export interface TabStoreState {
  activeTabIndex: number;
  pagerScrollEnabled: boolean;
  setActiveTabIndex: (index: number) => void;
  setPagerScrollEnabled: (enabled: boolean) => void;
  scrollToTab: (index: number) => void;
}

export const useTabStore = create<TabStoreState>((set) => ({
  activeTabIndex: 0,
  pagerScrollEnabled: true,
  setActiveTabIndex: (index: number) => set({ activeTabIndex: index }),
  setPagerScrollEnabled: (enabled: boolean) => {
    setPagerScrollEnabledDirect(enabled);
    set((state) => (state.pagerScrollEnabled !== enabled ? { pagerScrollEnabled: enabled } : state));
  },
  scrollToTab: (index: number) => {
    // 1. Immediately guard against stale Android onScroll events
    isProgrammaticScroll = true;
    if (scrollLockTimeout) clearTimeout(scrollLockTimeout);

    // 2. Synchronously update bottom bar active indicator (0ms)
    set({ activeTabIndex: index });

    // 3. Synchronously jump native ScrollView directly to targeted tab (0ms)
    try {
      const width = Dimensions.get("window").width;
      globalPagerRef?.scrollTo({
        x: index * width,
        animated: false,
      });
    } catch {}

    // 4. Release programmatic guard once Android native scroll events clear
    scrollLockTimeout = setTimeout(() => {
      isProgrammaticScroll = false;
    }, 150);
  },
}));
