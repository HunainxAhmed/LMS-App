import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";
import { getSecureItem, saveSecureItem, KEYS } from "./storage";

// Configure local notification display behavior (native only)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isProgress = notification.request.content.data?.type === "DOWNLOAD_PROGRESS";
      return {
        shouldShowAlert: true,
        shouldPlaySound: !isProgress && Boolean(notification.request.content.sound),
        shouldSetBadge: !isProgress,
        shouldShowBanner: true, // Show banner so user sees download starting and progressing
        shouldShowList: true,
      };
    },
  });
}

export async function setupNotifications() {
  if (Platform.OS === "web") {
    // Request web notification permissions if available
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {}
    return null;
  }

  try {
    // 1. Android Notification Channels Setup
    if (Platform.OS === "android") {
      try {
        await Notifications.setNotificationChannelAsync("academic_alerts", {
          name: "LMS ∞ Academic & Deadline Alerts",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#059669",
        });

        await Notifications.setNotificationChannelAsync("default", {
          name: "LMS ∞ General Notifications",
          importance: Notifications.AndroidImportance.DEFAULT,
        });

        // Dedicated download progress channel
        await Notifications.setNotificationChannelAsync("downloads", {
          name: "LMS ∞ File Downloads",
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: undefined,
          enableVibrate: false,
          showBadge: false,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      } catch (channelErr) {
        console.log("Android notification channel setup note:", channelErr);
      }
    }

    // 2. Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return null;
    }

    // 3. Remote push token extraction (EAS build / physical device)
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId ??
        "67c8e13f-c02d-4403-ada7-efa9a1dfc583";

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      if (tokenData?.data) {
        await saveSecureItem("cf_expo_push_token", tokenData.data);
        const authToken = await getSecureItem(KEYS.ACCESS_TOKEN);
        if (authToken) {
          try {
            await api.registerDevice(tokenData.data, `${Platform.OS} device`, Platform.OS);
            console.log("Device push token successfully registered with LMS ∞ backend.");
          } catch (regErr) {
            console.log("Push token registration deferred until login:", regErr);
          }
        }
        return tokenData.data;
      }
    } catch (e) {
      console.log("Expo push token extraction note (local notification fallback active):", e);
    }
  } catch (err) {
    console.warn("Notification setup error handled safely:", err);
  }
  return null;
}

/**
 * Registers the device's stored push token with the backend once the user is authenticated.
 */
export async function registerStoredPushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    let token = await getSecureItem("cf_expo_push_token");
    if (!token) {
      token = await setupNotifications();
    }
    const authToken = await getSecureItem(KEYS.ACCESS_TOKEN);
    if (token && authToken) {
      await api.registerDevice(token, `${Platform.OS} device`, Platform.OS);
      console.log("Stored device push token registered successfully with backend.");
    }
  } catch (err) {
    console.log("Could not register stored push token:", err);
  }
}

/**
 * Emits an immediate high-priority local notification when a new assignment is detected.
 */
export async function notifyNewAssignment({
  title,
  courseName,
  deadline,
}: {
  title: string;
  courseName: string;
  deadline?: string;
}) {
  if (Platform.OS === "web") return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `NEW ASSIGNMENT: ${courseName}`,
        body: `${title} has been uploaded.\nDue: ${deadline || "Check LMS"}`,
        data: { deepLink: "/(tabs)/assignments" },
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.HIGH,
        color: "#059669",
      },
      trigger: Platform.OS === "android" ? { channelId: "academic_alerts" } : null,
    });
  } catch (err) {
    console.debug("Local assignment notification error:", err);
  }
}

/**
 * Emits an immediate high-priority local notification when an attendance update is recorded.
 */
export async function notifyAttendanceUpdate({
  courseTitle,
  status,
  percentage,
  presentHours,
  totalHours,
}: {
  courseTitle: string;
  status: "PRESENT" | "ABSENT" | "WARNING";
  percentage: number;
  presentHours?: number;
  totalHours?: number;
}) {
  if (Platform.OS === "web") return;
  try {
    const isPresent = status === "PRESENT";
    const isWarning = status === "WARNING";
    const title = isWarning
      ? `ATTENDANCE WARNING: ${courseTitle} ⚠️`
      : isPresent
      ? `ATTENDANCE: Marked Present ✅`
      : `ATTENDANCE: Marked Absent ❌`;

    const body = isWarning
      ? `Attendance dropped below threshold to ${percentage}% in ${courseTitle}. Zero safe misses remaining!`
      : isPresent
      ? `You were marked present in ${courseTitle}.\nAttendance: ${percentage}% (${presentHours || 0}/${totalHours || 0} hrs).`
      : `You were marked absent in ${courseTitle}.\nAttendance: ${percentage}% (${presentHours || 0}/${totalHours || 0} hrs).`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { deepLink: "/(tabs)/courses" },
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.HIGH,
        color: !isPresent ? "#dc2626" : "#059669",
      },
      trigger: Platform.OS === "android" ? { channelId: "academic_alerts" } : null,
    });
  } catch (err) {
    console.debug("Local attendance notification error:", err);
  }
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === "granted";
  } catch (e) {
    console.warn("Could not check notification permissions:", e);
    return false;
  }
}

export const DOWNLOAD_NOTIFICATION_ID = "campusflow_download_progress";

/**
 * Generates a high-contrast visual block progress bar:
 * e.g., [████████░░░░] 67%
 */
export function formatNotificationProgressBar(percent: number, length: number = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * length);
  const empty = Math.max(0, length - filled);
  return "█".repeat(filled) + "░".repeat(empty);
}

// Throttling state to prevent overloading the OS NotificationManager
let lastNotificationTimestamp = 0;
let lastReportedPercent = -1;

export async function updateDownloadProgressNotification({
  title,
  percent,
  current,
  total,
  filename,
  force = false,
}: {
  title: string;
  percent: number;
  current?: number;
  total?: number;
  filename?: string;
  force?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  // Web Notification fallback
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const bar = formatNotificationProgressBar(clamped, 10);
        // Only trigger every 25% or force to prevent spam
        if (force || clamped % 25 === 0) {
          new Notification(title || "CampusFlow Download", {
            body: `${bar} ${clamped}%\n${filename || "Downloading file..."}`,
            icon: "/assets/icon.png",
            tag: DOWNLOAD_NOTIFICATION_ID,
          });
        }
      }
    } catch {}
    return;
  }

  const now = Date.now();

  // Rate-limit: update if forced, or 300ms elapsed, or percentage jumped by >= 3%
  if (!force && now - lastNotificationTimestamp < 300 && Math.abs(clamped - lastReportedPercent) < 3) {
    return;
  }
  lastNotificationTimestamp = now;
  lastReportedPercent = clamped;

  const bar = formatNotificationProgressBar(clamped, 12);
  const subtitle =
    total && total > 1 && current
      ? `${clamped}% • File ${current} of ${total}`
      : `${clamped}% Complete`;
  const bodyText = filename ? `${bar}  ${clamped}%\n📁 ${filename}` : `${bar}  ${clamped}%`;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DOWNLOAD_NOTIFICATION_ID,
      content: {
        title: `${title || "Downloading"} — ${clamped}%`,
        subtitle,
        body: bodyText,
        sticky: true,
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
        color: "#0f766e",
        data: {
          type: "DOWNLOAD_PROGRESS",
          percent: clamped,
          current,
          total,
          filename,
        },
      },
      trigger: Platform.OS === "android" ? { channelId: "downloads" } : null,
    });
  } catch (err) {
    console.warn("Could not schedule download progress notification:", err);
  }
}

export async function showDownloadCompleteNotification({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification(title || "Download Complete! 🎉", {
          body: message,
          icon: "/assets/icon.png",
          tag: DOWNLOAD_NOTIFICATION_ID,
        });
      }
    } catch {}
    return;
  }
  lastReportedPercent = -1;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DOWNLOAD_NOTIFICATION_ID,
      content: {
        title: title || "Download Complete! 🎉",
        subtitle: "Saved to storage",
        body: message,
        sticky: false,
        autoDismiss: true,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        color: "#0f766e",
        data: { type: "DOWNLOAD_COMPLETE" },
      },
      trigger: Platform.OS === "android" ? { channelId: "academic_alerts" } : null,
    });
  } catch (err) {}
}

export async function dismissDownloadNotification() {
  if (Platform.OS === "web") return;
  lastReportedPercent = -1;
  try {
    await Notifications.dismissNotificationAsync(DOWNLOAD_NOTIFICATION_ID);
  } catch {}
}

export async function scheduleLocalAssignmentReminder(
  assignmentTitle: string,
  courseName: string,
  triggerDate: Date
) {
  try {
    const seconds = Math.floor((triggerDate.getTime() - Date.now()) / 1000);
    if (seconds <= 0) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `UPCOMING DEADLINE: ${courseName}`,
        body: `${assignmentTitle} is due soon! Check your submission on CampusFlow.`,
        data: { deepLink: "/(tabs)/assignments" },
        sound: "default",
      },
      trigger: {
        seconds,
        channelId: "academic_alerts",
      },
    });
  } catch (e) {
    console.warn("Error scheduling local reminder:", e);
  }
}
