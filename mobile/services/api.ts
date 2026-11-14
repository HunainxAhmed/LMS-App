import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getServerUrl, getSecureItem, saveSecureItem, KEYS, getUniversityCredentials } from "./storage";

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getServerUrl();
  const url = `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;

  const token = await getSecureItem(KEYS.ACCESS_TOKEN);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    throw new ApiError(
      `Unable to connect to LMS ∞ Cloud Server. Please verify your internet connection and try again.`,
      0
    );
  }

  // Token refresh logic on 401 (exclude auth endpoints and university credential verification)
  if (
    response.status === 401 &&
    !endpoint.includes("/auth/login") &&
    !endpoint.includes("/auth/refresh") &&
    !endpoint.includes("/lms/connect")
  ) {
    const refreshToken = await getSecureItem(KEYS.REFRESH_TOKEN);
    if (refreshToken) {
      try {
        const refreshResp = await fetch(`${baseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshResp.ok) {
          const newTokens = await refreshResp.json();
          await saveSecureItem(KEYS.ACCESS_TOKEN, newTokens.access_token);
          await saveSecureItem(KEYS.REFRESH_TOKEN, newTokens.refresh_token);

          // Retry original request with fresh access token
          headers["Authorization"] = `Bearer ${newTokens.access_token}`;
          response = await fetch(url, { ...options, headers });
        }
      } catch (e) {
        // Refresh failed, proceed to handle original error
      }
    }
  }

  let data: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorDetail = (data && data.detail) || response.statusText || "Request failed";
    throw new ApiError(errorDetail, response.status, data);
  }

  return data as T;
}

export const api = {
  // Auth
  register: (body: { email: string; password: string }) =>
    request<{ access_token: string; refresh_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getProfile: () => request<any>("/auth/me"),

  // LMS Connection
  connectLMS: (body: {
    enrollment: string;
    password: string;
    campus_id: string;
    campus_name: string;
    enable_cloud_monitoring: boolean;
  }) =>
    request<any>("/lms/connect", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  connectDemoLMS: () =>
    request<any>("/lms/connect-demo", {
      method: "POST",
    }),

  toggleCloudMonitoring: (enabled: boolean, password: string = "") =>
    request<any>(`/lms/toggle-cloud-monitoring?enabled=${enabled}&password=${encodeURIComponent(password)}`, {
      method: "POST",
    }),

  disconnectLMS: () =>
    request<any>("/lms/disconnect", {
      method: "POST",
    }),

  // Dashboard & Academic
  getDashboard: () => request<any>("/dashboard"),

  getCourses: () => request<any[]>("/courses"),

  getAssignments: (params?: { filter_by?: string; course_id?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.filter_by) query.append("filter_by", params.filter_by);
    if (params?.course_id) query.append("course_id", params.course_id);
    if (params?.search) query.append("search", params.search);
    const qs = query.toString();
    return request<any[]>(`/assignments${qs ? `?${qs}` : ""}`);
  },

  updateAssignmentStatus: (id: string, completed: boolean) =>
    request<any>(`/assignments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ personal_completed: completed }),
    }),

  submitAssignment: async (
    assignmentId: string,
    fileUri: string,
    fileName: string,
    mimeType: string = "application/pdf"
  ) => {
    let base64Data = "";
    const safeName = (fileName || `upload_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const tempCopyPath = `${FileSystem.cacheDirectory}sub_${Date.now()}_${safeName}`;

    // Attempt 1 (Native Android/iOS): Always copy to root cacheDirectory before reading.
    // This completely resolves 'java.io.IOException: Location .../cache/DocumentPicker/... isn't readable'
    if (Platform.OS !== "web") {
      try {
        await FileSystem.copyAsync({
          from: fileUri,
          to: tempCopyPath,
        });
        base64Data = await FileSystem.readAsStringAsync(tempCopyPath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        FileSystem.deleteAsync(tempCopyPath, { idempotent: true }).catch(() => {});
      } catch (copyErr) {
        console.warn("FileSystem copy+read failed, trying fetch-blob fallback:", copyErr);
      }
    }

    // Attempt 2 (Web & Native fallback): Fetch local URI as blob and read via FileReader
    if (!base64Data) {
      try {
        const resp = await fetch(fileUri);
        const blob = await resp.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result as string;
            const b64 = res.includes(",") ? res.split(",")[1] : res;
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (blobErr) {
        console.warn("fetch blob fallback failed:", blobErr);
      }
    }

    // Attempt 3 (Native fallback): Direct readAsStringAsync
    if (!base64Data && Platform.OS !== "web") {
      try {
        base64Data = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (directErr) {
        console.warn("direct readAsStringAsync failed:", directErr);
      }
    }

    if (!base64Data) {
      throw new Error("Unable to read selected document into base64. Please try another file.");
    }

    return request<any>(`/assignments/${assignmentId}/submit-json`, {
      method: "POST",
      body: JSON.stringify({
        file_name: fileName,
        file_base64: base64Data,
        mime_type: mimeType || "application/pdf",
      }),
    });
  },

  deleteAssignmentSubmission: (assignmentId: string) =>
    request<any>(`/assignments/${assignmentId}/submission`, {
      method: "DELETE",
    }),

  getAttendance: () => request<any[]>("/attendance"),

  calculateAttendance: (present: number, total: number, requiredPercentage = 75.0) =>
    request<any>("/attendance/calculate", {
      method: "POST",
      body: JSON.stringify({
        present_hours: present,
        total_hours: total,
        required_percentage: requiredPercentage,
      }),
    }),

  getMaterials: (params?: { course_id?: string; week?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.course_id) query.append("course_id", params.course_id);
    if (params?.week) query.append("week", params.week);
    if (params?.search) query.append("search", params.search);
    const qs = query.toString();
    return request<any[]>(`/materials${qs ? `?${qs}` : ""}`);
  },

  getGrades: () => request<any[]>("/grades"),
  getResults: () => request<any>("/results"),
  getCommunityServices: () =>
    request<{
      total_hours: number;
      required_hours: number;
      is_fulfilled: boolean;
      records: Array<{
        semester: string;
        organization: string;
        job_title?: string;
        completed_date: string;
        hours: number;
      }>;
    }>("/academic/community-services"),

  getAnnouncements: () => request<any[]>("/announcements"),

  // Sync
  triggerSync: async (forceFresh = false) => {
    // If in Local-Only mode, fetch stored credentials from device SecureStore
    const creds = await getUniversityCredentials();
    const payload: any = { force_fresh_login: forceFresh };

    if (creds.enrollment && creds.password) {
      payload.credentials = {
        enrollment: creds.enrollment,
        password: creds.password,
        campus_id: creds.campusId || "2",
        campus_name: creds.campusName || "Karachi Campus",
        enable_cloud_monitoring: false,
      };
    }

    return request<any>("/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getSyncStatus: () => request<any>("/sync/status"),

  // Notifications
  getNotifications: (category?: string) => {
    const q = category ? `?category=${category}` : "";
    return request<any>(`/notifications${q}`);
  },

  markNotificationsRead: (ids?: string[], allRead = false) =>
    request<any>(`/notifications/read?all_read=${allRead}`, {
      method: "POST",
      body: JSON.stringify({ notification_ids: ids || [] }),
    }),

  clearReadNotifications: () =>
    request<{ success: boolean; deleted_count: number }>("/notifications/clear-read", {
      method: "DELETE",
    }),

  getPreferences: () => request<any>("/notifications/preferences"),

  updatePreferences: (prefs: any) =>
    request<any>("/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify(prefs),
    }),

  registerDevice: (pushToken: string, deviceName = "", platform = "android") =>
    request<any>("/devices/register", {
      method: "POST",
      body: JSON.stringify({ push_token: pushToken, device_name: deviceName, platform }),
    }),

  testPushNotification: (title?: string, body?: string) =>
    request<any>("/notifications/test", {
      method: "POST",
      body: JSON.stringify({ title, body }),
    }),

  // File Download URL Builder
  getFileDownloadUrl: async (params: {
    materialId?: string;
    assignmentId?: string;
    targetType?: "teacher" | "submission";
    url?: string;
    filename?: string;
  }) => {
    const baseUrl = await getServerUrl();
    const token = await getSecureItem(KEYS.ACCESS_TOKEN);
    const q = new URLSearchParams();
    if (params.materialId) q.append("material_id", params.materialId);
    if (params.assignmentId) q.append("assignment_id", params.assignmentId);
    if (params.targetType) q.append("target_type", params.targetType);
    if (params.url) q.append("url", params.url);
    if (params.filename) q.append("filename", params.filename);
    if (token) q.append("token", token);
    return `${baseUrl.replace(/\/+$/, "")}/downloads/file?${q.toString()}`;
  },

  // Course ZIP URL Builder
  getCourseZipDownloadUrl: async (courseId: string) => {
    const baseUrl = await getServerUrl();
    const token = await getSecureItem(KEYS.ACCESS_TOKEN);
    return `${baseUrl.replace(/\/+$/, "")}/downloads/course/${courseId}/zip?token=${token}`;
  },

  // Dynamic In-App Updates
  checkAppUpdate: (currentVersion = "1.0.0", platform = Platform.OS) =>
    request<{
      latest_version: string;
      current_version: string;
      is_update_available: boolean;
      is_mandatory: boolean;
      release_notes: string[];
      download_url: string;
      ota_compatible: boolean;
      file_size_bytes: number;
      published_at: string;
    }>(`/app/check-update?current_version=${currentVersion}&platform=${platform}`),

  getLatestApkDownloadUrl: async () => {
    const baseUrl = await getServerUrl();
    return `${baseUrl.replace(/\/+$/, "")}/app/download-apk`;
  },
};
