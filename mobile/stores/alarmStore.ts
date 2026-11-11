import { create } from "zustand";
import { Platform, Vibration } from "react-native";
import {
  AssignmentAlarm,
  getAssignmentAlarms,
  scheduleAssignmentAlarm,
  cancelAssignmentAlarm,
  snoozeAssignmentAlarm,
} from "../services/alarmService";

interface AlarmState {
  alarms: Record<string, AssignmentAlarm>;
  activeRingingAlarm: AssignmentAlarm | null;
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
  triggerRingingAlarm: (alarm: AssignmentAlarm) => void;
  dismissRingingAlarm: () => void;
}

export const useAlarmStore = create<AlarmState>((set, get) => ({
  alarms: {},
  activeRingingAlarm: null,
  isLoading: false,

  triggerRingingAlarm: (alarm: AssignmentAlarm) => {
    // Start continuous urgent alarm vibration
    if (Platform.OS !== "web") {
      try {
        Vibration.vibrate([0, 800, 300, 800, 300, 800, 300, 1200], true);
      } catch {}
    }
    set({ activeRingingAlarm: alarm });
  },

  dismissRingingAlarm: () => {
    if (Platform.OS !== "web") {
      try {
        Vibration.cancel();
      } catch {}
    }
    set({ activeRingingAlarm: null });
  },

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
      if (Platform.OS !== "web") {
        try {
          Vibration.cancel();
        } catch {}
      }
      await cancelAssignmentAlarm(assignmentId);
      set((state) => {
        const next = { ...state.alarms };
        delete next[assignmentId];
        return {
          alarms: next,
          activeRingingAlarm: state.activeRingingAlarm?.assignmentId === assignmentId ? null : state.activeRingingAlarm,
          isLoading: false,
        };
      });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  snoozeAlarm: async (assignmentId: string, hours = 24) => {
    set({ isLoading: true });
    try {
      if (Platform.OS !== "web") {
        try {
          Vibration.cancel();
        } catch {}
      }
      const updated = await snoozeAssignmentAlarm(assignmentId, hours);
      if (updated) {
        set((state) => ({
          alarms: { ...state.alarms, [assignmentId]: updated },
          activeRingingAlarm: state.activeRingingAlarm?.assignmentId === assignmentId ? null : state.activeRingingAlarm,
          isLoading: false,
        }));
      } else {
        set({
          isLoading: false,
          activeRingingAlarm: get().activeRingingAlarm?.assignmentId === assignmentId ? null : get().activeRingingAlarm,
        });
      }
      return updated;
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },
}));
