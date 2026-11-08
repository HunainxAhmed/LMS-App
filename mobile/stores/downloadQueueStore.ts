import { create } from "zustand";

export interface ActiveDownloadState {
  isActive: boolean;
  courseTitle: string;
  currentFileName: string;
  currentIndex: number;
  totalCount: number;
  percent: number;
  isComplete: boolean;

  setDownloadStarted: (courseTitle: string, totalCount: number) => void;
  setDownloadProgress: (currentFileName: string, currentIndex: number, percent: number) => void;
  setDownloadCompleted: () => void;
  clearActiveDownload: () => void;
}

export const useDownloadQueueStore = create<ActiveDownloadState>((set) => ({
  isActive: false,
  courseTitle: "",
  currentFileName: "",
  currentIndex: 0,
  totalCount: 0,
  percent: 0,
  isComplete: false,

  setDownloadStarted: (courseTitle: string, totalCount: number) =>
    set({
      isActive: true,
      courseTitle,
      currentFileName: "Preparing download...",
      currentIndex: 0,
      totalCount,
      percent: 0,
      isComplete: false,
    }),

  setDownloadProgress: (currentFileName: string, currentIndex: number, percent: number) =>
    set({
      currentFileName,
      currentIndex,
      percent: Math.max(0, Math.min(100, percent)),
    }),

  setDownloadCompleted: () =>
    set({
      isActive: false,
      percent: 100,
      isComplete: true,
    }),

  clearActiveDownload: () =>
    set({
      isActive: false,
      courseTitle: "",
      currentFileName: "",
      currentIndex: 0,
      totalCount: 0,
      percent: 0,
      isComplete: false,
    }),
}));
