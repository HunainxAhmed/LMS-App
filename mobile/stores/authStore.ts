import { create } from "zustand";
import { api } from "../services/api";
import { registerStoredPushToken } from "../services/notifications";
import {
  saveSecureItem,
  getSecureItem,
  deleteSecureItem,
  saveUniversityCredentials,
  getUniversityCredentials,
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
    // 1. Immediately inspect local cache first so user never sees a login flash or gets logged out offline in university
    const cachedProfileRaw = await getSecureItem("cf_user_profile");
    let initialUser: any = null;
    let initialAccount: any = null;

    if (cachedProfileRaw) {
      try {
        const parsed = JSON.parse(cachedProfileRaw);
        initialUser = parsed;
        initialAccount = parsed.university_account;
      } catch {}
    }

    const token = await getSecureItem(KEYS.ACCESS_TOKEN);
    const { enrollment, password, campusId, campusName } = await getUniversityCredentials();

    if (initialUser && initialAccount) {
      set({
        user: initialUser,
        account: initialAccount,
        isAuthenticated: true,
        isLoading: false,
      });
      registerStoredPushToken().catch(() => {});
    } else if (token || enrollment) {
      set({ isLoading: true });
    } else {
      set({
        user: null,
        account: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return;
    }

    // 2. Fetch fresh profile from server in background
    try {
      const profile = await api.getProfile();
      await saveSecureItem("cf_user_profile", JSON.stringify(profile));
      set({
        user: profile,
        account: profile.university_account,
        isAuthenticated: true,
        isLoading: false,
      });
      registerStoredPushToken().catch(() => {});
    } catch (e: any) {
      // If error is 401 Unauthorized (token expired) and student credentials exist
      if (e?.status === 401 && enrollment && password) {
        try {
          console.log("Access token expired. Auto-renewing session with stored university credentials...");
          const cleanEnroll = enrollment.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
          const internalEmail = `${cleanEnroll}@student.campusflow.internal`;
          const internalPassword = `CF_${cleanEnroll}_2025!`;

          let tokens;
          try {
            tokens = await api.login({ email: internalEmail, password: internalPassword });
          } catch {
            tokens = await api.register({ email: internalEmail, password: internalPassword });
          }
          await saveSecureItem(KEYS.ACCESS_TOKEN, tokens.access_token);
          await saveSecureItem(KEYS.REFRESH_TOKEN, tokens.refresh_token);

          const freshProfile = await api.getProfile();
          await saveSecureItem("cf_user_profile", JSON.stringify(freshProfile));
          set({
            user: freshProfile,
            account: freshProfile.university_account,
            isAuthenticated: true,
            isLoading: false,
          });
          registerStoredPushToken().catch(() => {});
          return;
        } catch (reAuthErr) {
          console.log("Automatic re-auth failed:", reAuthErr);
        }
      }

      // If it was a network error (weak university Wi-Fi, timeout, offline, cold start):
      // NEVER kick the student out if they have cached profile or credentials!
      if (initialUser && initialAccount) {
        console.log("Network unreachable in university; preserving authenticated offline session.");
        set({
          user: initialUser,
          account: initialAccount,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (enrollment) {
        const fallbackAccount = {
          enrollment,
          campus_name: campusName || "Karachi Campus",
          campus_id: campusId || "2",
          full_name: enrollment,
        };
        set({
          user: { id: "offline_user", email: `${enrollment}@student.bahria` },
          account: fallbackAccount,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          account: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
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
      await saveSecureItem("cf_user_profile", JSON.stringify(profile));
      set({
        user: profile,
        account: profile.university_account,
        isAuthenticated: true,
        isLoading: false,
      });
      registerStoredPushToken().catch(() => {});

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
      await saveSecureItem("cf_user_profile", JSON.stringify(profile));
      set({
        user: profile,
        account: profile.university_account,
        isAuthenticated: true,
        isLoading: false,
      });
      registerStoredPushToken().catch(() => {});

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
      await deleteSecureItem("cf_user_profile");
      await get().checkAuth();
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  syncNow: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true, syncProgressStep: "Connecting to university portal..." });
    try {
      await api.triggerSync();
      // Poll sync status smoothly in background for up to 35 seconds
      const maxAttempts = 25;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const status = await api.getSyncStatus();
          if (status.current_step) {
            set({ syncProgressStep: status.current_step });
          }
          if (status.status === "SUCCESS") {
            set({ syncProgressStep: "All records synchronized successfully! ✅" });
            break;
          } else if (status.status === "FAILED") {
            set({ syncProgressStep: status.error_message || "Sync encountered an error" });
            break;
          }
        } catch {}
      }
      await get().checkAuth();
    } catch (e) {
      console.warn("Sync failed:", e);
    } finally {
      setTimeout(() => {
        set({ isSyncing: false, syncProgressStep: "" });
      }, 1500);
    }
  },

  logout: async () => {
    await deleteSecureItem(KEYS.ACCESS_TOKEN);
    await deleteSecureItem(KEYS.REFRESH_TOKEN);
    await deleteSecureItem("cf_user_profile");
    await clearUniversityCredentials();
    set({
      user: null,
      account: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
}));
