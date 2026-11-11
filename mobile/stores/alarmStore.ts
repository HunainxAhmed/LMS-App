import { create } from "zustand";
import {
  AssignmentAlarm,
  getAssignmentAlarms,
  scheduleAssignmentAlarm,
  cancelAssignmentAlarm,
  snoozeAssignmentAlarm,
} from "../services/alarmService";

interface AlarmState {
  alarms: Record<string, AssignmentAlarm>;
  isLoading: boolean;
  loadAlarms: () => Promise<void>;
  setAlarm: (params: {
    assignmentId: string;
    courseName: string;
    title: string;
    deadlineRaw: string;
    deadlineIso?: string;
    triggerDate: Date;
  }) => Promise<AssignmentAlarm>;
  cancelAlarm: (assignmentId: string) => Promise<void>;
  snoozeAlarm: (assignmentId: string, hours?: number) => Promise<AssignmentAlarm | null>;
}

export const useAlarmStore = create<AlarmState>((set, get) => ({
  alarms: {},
  isLoading: false,

  loadAlarms: async () => {
    try {
      const records = await getAssignmentAlarms();
      set({ alarms: records });
    } catch (e) {
      console.warn("Could not load alarms into store:", e);
    }
  },

  setAlarm: async (params) => {
    set({ isLoading: true });
    try {
      const created = await scheduleAssignmentAlarm(params);
      set((state) => ({
        alarms: { ...state.alarms, [params.assignmentId]: created },
        isLoading: false,
      }));
      return created;
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  cancelAlarm: async (assignmentId: string) => {
    set({ isLoading: true });
    try {
      await cancelAssignmentAlarm(assignmentId);
      set((state) => {
        const next = { ...state.alarms };
        delete next[assignmentId];
        return { alarms: next, isLoading: false };
      });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  snoozeAlarm: async (assignmentId: string, hours = 24) => {
    set({ isLoading: true });
    try {
      const updated = await snoozeAssignmentAlarm(assignmentId, hours);
      if (updated) {
        set((state) => ({
          alarms: { ...state.alarms, [assignmentId]: updated },
          isLoading: false,
        }));
      } else {
        set({ isLoading: false });
      }
      return updated;
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },
}));
