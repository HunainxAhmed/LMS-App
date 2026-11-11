import { create } from "zustand";

export interface DownloadToastPayload {
  fileName: string;
  fileUri: string;
  mimeType?: string;
  fileSize?: number;
  category?: "assignment" | "lecture" | "submission";
  courseName?: string;
  onOpen?: () => void;
}

interface DownloadToastState {
  visible: boolean;
  payload: DownloadToastPayload | null;
  show: (payload: DownloadToastPayload) => void;
  hide: () => void;
}

export const useDownloadToastStore = create<DownloadToastState>((set) => ({
  visible: false,
  payload: null,
  show: (payload) => set({ visible: true, payload }),
  hide: () => set({ visible: false, payload: null }),
}));

export function showDownloadSuccessToast(payload: DownloadToastPayload) {
  useDownloadToastStore.getState().show(payload);
}
