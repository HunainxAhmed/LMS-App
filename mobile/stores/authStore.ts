import { create } from "zustand";
import { api } from "../services/api";
import {
  saveSecureItem,
  deleteSecureItem,
  saveUniversityCredentials,
  clearUniversityCredentials,
  KEYS,
  DEFAULT_API_URL,
} from "../services/storage";

interface AuthState {
  user: any | null;
  account: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  syncProgressStep: string;
  serverUrl: string;

  checkAuth: () => Promise<void>;
  loginCampusFlow: (email: string, password: string) => Promise<void>;
  registerCampusFlow: (email: string, password: string) => Promise<void>;
  connectLMS: (params: {
    enrollment: string;
    password: string;
    campus_id: string;
    campus_name: string;
    enable_cloud_monitoring: boolean;
  }) => Promise<void>;
  connectStudentComplete: (params: {
    enrollment: string;
    password: string;
    campus_id: string;
    campus_name: string;
    enable_cloud_monitoring: boolean;
  }) => Promise<any>;
  connectDemoStudent: () => Promise<any>;
  disconnectLMS: () => Promise<void>;
  syncNow: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  account: null,
  isAuthenticated: false,
  isLoading: true,
  isSyncing: false,
  syncProgressStep: "",
  serverUrl: DEFAULT_API_URL,

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const profile = await api.getProfile();
      set({
        user: profile,
        account: profile.university_account,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (e) {
      set({
        user: null,
        account: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  loginCampusFlow: async (email, password) => {
    set({ isLoading: true });
    try {
      const tokens = await api.login({ email, password });
      await saveSecureItem(KEYS.ACCESS_TOKEN, tokens.access_token);
      await saveSecureItem(KEYS.REFRESH_TOKEN, tokens.refresh_token);
      await get().checkAuth();
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  registerCampusFlow: async (email, password) => {
    set({ isLoading: true });
    try {
      const tokens = await api.register({ email, password });
      await saveSecureItem(KEYS.ACCESS_TOKEN, tokens.access_token);
      await saveSecureItem(KEYS.REFRESH_TOKEN, tokens.refresh_token);
      await get().checkAuth();
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  connectLMS: async (params) => {
    set({ isLoading: true });
    try {
      // Always store locally in device's SecureStore (Android Keystore / iOS Keychain)
      await saveUniversityCredentials(
        params.enrollment,
        params.password,
        params.campus_id,
        params.campus_name
      );

      const resp = await api.connectLMS(params);
      await get().checkAuth();
      return resp;
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  connectStudentComplete: async (params: {
    enrollment: string;
    password: string;
    campus_id: string;
    campus_name: string;
    enable_cloud_monitoring: boolean;
  }) => {
    set({ isLoading: true });
    try {
      const cleanEnroll = params.enrollment.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const internalEmail = `${cleanEnroll}@student.campusflow.internal`;
      const internalPassword = `CF_${cleanEnroll}_2025!`;

      // 1. Authenticate or Register CampusFlow user token
      let tokens;
      try {
        tokens = await api.login({ email: internalEmail, password: internalPassword });
      } catch (loginErr) {
        tokens = await api.register({ email: internalEmail, password: internalPassword });
      }

      await saveSecureItem(KEYS.ACCESS_TOKEN, tokens.access_token);
      await saveSecureItem(KEYS.REFRESH_TOKEN, tokens.refresh_token);

      // 2. Store locally in device's SecureStore
      await saveUniversityCredentials(
        params.enrollment,
        params.password,
        params.campus_id,
        params.campus_name
      );

      // 3. Connect Bahria University CMS & LMS via backend
      const resp = await api.connectLMS(params);

      // 4. Update auth state atomically with user & university account
      const profile = await api.getProfile();
      set({
        user: profile,
        account: profile.university_account,
        isAuthenticated: true,
        isLoading: false,
      });

      return resp;
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  connectDemoStudent: async () => {
    set({ isLoading: true });
    try {
      const demoEmail = "demo.student@campusflow.internal";
      const demoPassword = "DemoStudentPassword123!";

      let tokens;
      try {
        tokens = await api.login({ email: demoEmail, password: demoPassword });
      } catch (e) {
        tokens = await api.register({ email: demoEmail, password: demoPassword });
      }

      await saveSecureItem(KEYS.ACCESS_TOKEN, tokens.access_token);
      await saveSecureItem(KEYS.REFRESH_TOKEN, tokens.refresh_token);

      await saveUniversityCredentials(
        "02-134212-042",
        "DemoPassword123",
        "2",
        "Karachi Campus"
      );

      const resp = await api.connectDemoLMS();

      const profile = await api.getProfile();
      set({
        user: profile,
        account: profile.university_account,
        isAuthenticated: true,
        isLoading: false,
      });

      return resp;
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  disconnectLMS: async () => {
    set({ isLoading: true });
    try {
      await api.disconnectLMS();
      await clearUniversityCredentials();
      await get().checkAuth();
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  syncNow: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true, syncProgressStep: "Connecting to CMS..." });
    try {
      await api.triggerSync();
      // Poll sync status briefly until completed
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await api.getSyncStatus();
        set({ syncProgressStep: status.current_step });
        if (status.status === "SUCCESS" || status.status === "FAILED") {
          break;
        }
      }
      await get().checkAuth();
    } catch (e) {
      console.warn("Sync failed:", e);
    } finally {
      set({ isSyncing: false, syncProgressStep: "" });
    }
  },

  logout: async () => {
    await deleteSecureItem(KEYS.ACCESS_TOKEN);
    await deleteSecureItem(KEYS.REFRESH_TOKEN);
    await clearUniversityCredentials();
    set({
      user: null,
      account: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
}));
