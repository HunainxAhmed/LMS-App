import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const KEYS = {
  ACCESS_TOKEN: "cf_access_token",
  REFRESH_TOKEN: "cf_refresh_token",
  BAHRIA_ENROLLMENT: "cf_bahria_enrollment",
  BAHRIA_PASSWORD: "cf_bahria_password",
  BAHRIA_CAMPUS_ID: "cf_bahria_campus_id",
  BAHRIA_CAMPUS_NAME: "cf_bahria_campus_name",
  SERVER_URL: "cf_server_url",
  OFFLINE_DASHBOARD: "cf_offline_dashboard",
  OFFLINE_ASSIGNMENTS: "cf_offline_assignments",
  OFFLINE_ATTENDANCE: "cf_offline_attendance",
  OFFLINE_COURSES: "cf_offline_courses",
  OFFLINE_MATERIALS: "cf_offline_materials",
};

// Default Production Backend on Render
export const DEFAULT_API_URL = "https://lmsapp-backend-gk3c.onrender.com/api/v1";

// ==============================================================================
// SECURE CREDENTIAL STORAGE (Android Keystore / iOS Keychain)
// ==============================================================================
export async function saveSecureItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    }
  } catch (e) {
    console.warn(`SecureStore write error for ${key}:`, e);
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    console.warn(`SecureStore read error for ${key}:`, e);
    return null;
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch (e) {
    console.warn(`SecureStore delete error for ${key}:`, e);
  }
}

// Credentials Convenience Helpers
export async function saveUniversityCredentials(enrollment: string, password: string, campusId: string, campusName: string) {
  await saveSecureItem(KEYS.BAHRIA_ENROLLMENT, enrollment);
  await saveSecureItem(KEYS.BAHRIA_PASSWORD, password);
  await saveSecureItem(KEYS.BAHRIA_CAMPUS_ID, campusId);
  await saveSecureItem(KEYS.BAHRIA_CAMPUS_NAME, campusName);
}

export async function getUniversityCredentials() {
  const enrollment = await getSecureItem(KEYS.BAHRIA_ENROLLMENT);
  const password = await getSecureItem(KEYS.BAHRIA_PASSWORD);
  const campusId = await getSecureItem(KEYS.BAHRIA_CAMPUS_ID);
  const campusName = await getSecureItem(KEYS.BAHRIA_CAMPUS_NAME);
  return { enrollment, password, campusId, campusName };
}

export async function clearUniversityCredentials() {
  await deleteSecureItem(KEYS.BAHRIA_ENROLLMENT);
  await deleteSecureItem(KEYS.BAHRIA_PASSWORD);
  await deleteSecureItem(KEYS.BAHRIA_CAMPUS_ID);
  await deleteSecureItem(KEYS.BAHRIA_CAMPUS_NAME);
}

// Server Base URL Configuration
export async function getServerUrl(): Promise<string> {
  const saved = await getSecureItem(KEYS.SERVER_URL);
  if (saved) return saved;
  if (Platform.OS === "web" && typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return "http://localhost:8000/api/v1";
  }
  return DEFAULT_API_URL;
}

export async function setServerUrl(url: string): Promise<void> {
  await saveSecureItem(KEYS.SERVER_URL, url.trim().replace(/\/+$/, ""));
}

// Offline Cache Helpers
export async function cacheOfflineData(key: string, data: any) {
  try {
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      data,
    });
    await saveSecureItem(key, payload);
  } catch (e) {
    console.warn("Offline cache error:", e);
  }
}

export async function getCachedOfflineData(key: string): Promise<{ timestamp: string; data: any } | null> {
  try {
    const raw = await getSecureItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ==============================================================================
// HOME SCREEN SECTION PREFERENCES
// ==============================================================================
export interface HomeScreenPreferences {
  showPending: boolean;
  showMissed: boolean;
  showLowAttendance: boolean;
}

export async function getHomeScreenPreferences(): Promise<HomeScreenPreferences> {
  const p = await getSecureItem("cf_home_show_pending");
  const m = await getSecureItem("cf_home_show_missed");
  const a = await getSecureItem("cf_home_show_low_attendance");
  return {
    showPending: p === null ? true : p === "true",
    showMissed: m === null ? true : m === "true",
    showLowAttendance: a === null ? true : a === "true",
  };
}

export async function saveHomeScreenPreferences(prefs: HomeScreenPreferences): Promise<void> {
  await saveSecureItem("cf_home_show_pending", String(prefs.showPending));
  await saveSecureItem("cf_home_show_missed", String(prefs.showMissed));
  await saveSecureItem("cf_home_show_low_attendance", String(prefs.showLowAttendance));
}

// ==============================================================================
// DOWNLOAD DIRECTORY PREFERENCE
// ==============================================================================
export const DEFAULT_DOWNLOAD_DIR =
  Platform.OS === "web"
    ? "Downloads/CampusFlow"
    : `${FileSystem.documentDirectory || ""}CampusFlow/Downloads/`;

export async function getDownloadDirectory(): Promise<string> {
  const custom = await getSecureItem("cf_download_directory");
  return custom || DEFAULT_DOWNLOAD_DIR;
}

export async function setDownloadDirectory(path: string): Promise<void> {
  await saveSecureItem("cf_download_directory", path.trim());
}

export async function resetDownloadDirectory(): Promise<string> {
  await deleteSecureItem("cf_download_directory");
  return DEFAULT_DOWNLOAD_DIR;
}

export { KEYS };

