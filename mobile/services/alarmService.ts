import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getSecureItem, saveSecureItem } from "./storage";

export interface AssignmentAlarm {
  assignmentId: string;
  courseName: string;
  title: string;
  deadlineRaw: string;
  deadlineIso?: string;
  triggerTimestamp: number; // Unix ms
  notificationId?: string;
  isSnoozed?: boolean;
  snoozedUntil?: number;
  createdAt: number;
}

const ALARMS_STORAGE_KEY = "cf_assignment_alarms";

/**
 * Parses raw deadline text or ISO strings into a JavaScript Date object.
 */
export function parseAssignmentDeadline(
  deadlineIso?: string | null,
  extendedDeadlineIso?: string | null,
  deadlineRaw?: string | null
): Date | null {
  if (extendedDeadlineIso) {
    const d = new Date(extendedDeadlineIso);
    if (!isNaN(d.getTime())) return d;
  }
  if (deadlineIso) {
    const d = new Date(deadlineIso);
    if (!isNaN(d.getTime())) return d;
  }
  if (deadlineRaw) {
    // Attempt standard parse first
    let d = new Date(deadlineRaw);
    if (!isNaN(d.getTime())) return d;

    // Normalize Bahria formats like "15-Nov-2026 11:59 PM" or "15 November 2026 11:59 PM"
    const cleaned = deadlineRaw.replace(/-/g, " ");
    d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Computes the default alarm trigger time, which is strictly 72 hours (3 days)
 * prior to the assignment deadline.
 * If 72 hours before is already in the past, gracefully falls back to halfway
 * between now and deadline, or 2 hours from now.
 */
export function computeDefaultAlarmDate(
  deadlineIso?: string | null,
  extendedDeadlineIso?: string | null,
  deadlineRaw?: string | null
): Date {
  const deadlineDate = parseAssignmentDeadline(deadlineIso, extendedDeadlineIso, deadlineRaw);
  const now = Date.now();

  if (deadlineDate && !isNaN(deadlineDate.getTime())) {
    const deadlineMs = deadlineDate.getTime();
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    const defaultTriggerMs = deadlineMs - seventyTwoHoursMs;

    if (defaultTriggerMs > now) {
      return new Date(defaultTriggerMs);
    }

    // If 72h prior has already passed but deadline is still in the future
    if (deadlineMs > now) {
      const remaining = deadlineMs - now;
      if (remaining > 24 * 60 * 60 * 1000) {
        // More than 24h left: default to 24h before
        return new Date(deadlineMs - 24 * 60 * 60 * 1000);
      }
      // Less than 24h: trigger in 1 hour or halfway
      return new Date(now + Math.max(30 * 60 * 1000, Math.floor(remaining / 2)));
    }
  }

  // Fallback: 2 hours from now
  return new Date(now + 2 * 60 * 60 * 1000);
}

/**
 * Retrieves all stored assignment alarms.
 */
export async function getAssignmentAlarms(): Promise<Record<string, AssignmentAlarm>> {
  try {
    const stored = await getSecureItem(ALARMS_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (e) {
    console.warn("Could not load assignment alarms:", e);
    return {};
  }
}

/**
 * Retrieves an alarm for a specific assignment ID if set.
 */
export async function getAlarmForAssignment(assignmentId: string): Promise<AssignmentAlarm | null> {
  const alarms = await getAssignmentAlarms();
  return alarms[assignmentId] || null;
}

export const ALARM_CHANNEL_ID = "assignment_alarms_loud_v3";

/**
 * Ensures Android high-priority alarm notification channel is registered
 * with native ALARM audio stream and continuous vibration.
 */
export async function ensureAlarmNotificationChannel(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
        name: "LMS ∞ Assignment Alarms (High Priority)",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 800, 300, 800, 300, 800, 300, 1200],
        sound: "default",
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          flags: {
            enforceAudibility: true,
            requestHardwareAudioVideoSynchronization: false,
          },
        },
        lightColor: "#f59e0b",
      });

      // Interactive lockscreen action buttons: Snooze & Dismiss
      await Notifications.setNotificationCategoryAsync("ASSIGNMENT_ALARM_ACTIONS", [
        {
          identifier: "SNOOZE_24H",
          buttonTitle: "⏰ Snooze 24h",
          options: { opensAppToForeground: false },
        },
        {
          identifier: "STOP_ALARM",
          buttonTitle: "✖ Stop Alarm",
          options: { isDestructive: true, opensAppToForeground: false },
        },
        {
          identifier: "VIEW_ASSIGNMENT",
          buttonTitle: "📄 View Assignment",
          options: { opensAppToForeground: true },
        },
      ]);
    } catch (e) {
      console.log("Alarm notification channel init note:", e);
    }
  }
}

/**
 * Schedules an assignment alarm notification at the specified date & time.
 */
export async function scheduleAssignmentAlarm(params: {
  assignmentId: string;
  courseName: string;
  title: string;
  deadlineRaw: string;
  deadlineIso?: string;
  triggerDate: Date;
}): Promise<AssignmentAlarm> {
  const { assignmentId, courseName, title, deadlineRaw, deadlineIso, triggerDate } = params;

  // 1. Cancel previous alarm if one exists
  await cancelAssignmentAlarm(assignmentId);

  // 2. Schedule native notification
  let notificationId: string | undefined;
  if (Platform.OS !== "web") {
    await ensureAlarmNotificationChannel();
    try {
      notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ ASSIGNMENT ALARM: ${courseName}`,
          body: `${title}\nDue: ${deadlineRaw || "Check LMS portal"}`,
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.MAX,
          categoryIdentifier: "ASSIGNMENT_ALARM_ACTIONS",
          data: {
            type: "ASSIGNMENT_ALARM",
            assignmentId,
            courseName,
            title,
            deadlineRaw,
            deepLink: "/(tabs)/assignments",
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          channelId: Platform.OS === "android" ? ALARM_CHANNEL_ID : undefined,
        },
      });
    } catch (err) {
      console.warn("Could not schedule native alarm notification:", err);
    }
  }

  // 3. Persist in secure storage
  const alarmRecord: AssignmentAlarm = {
    assignmentId,
    courseName,
    title,
    deadlineRaw,
    deadlineIso,
    triggerTimestamp: triggerDate.getTime(),
    notificationId,
    isSnoozed: false,
    createdAt: Date.now(),
  };

  const alarms = await getAssignmentAlarms();
  alarms[assignmentId] = alarmRecord;
  await saveSecureItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));

  return alarmRecord;
}

/**
 * Cancels and deletes an assignment alarm.
 */
export async function cancelAssignmentAlarm(assignmentId: string): Promise<void> {
  const alarms = await getAssignmentAlarms();
  const existing = alarms[assignmentId];

  if (existing) {
    if (existing.notificationId && Platform.OS !== "web") {
      try {
        await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
      } catch (e) {
        console.debug("Could not cancel scheduled notification:", e);
      }
    }
    delete alarms[assignmentId];
    await saveSecureItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
  }
}

/**
 * Snoozes an assignment alarm by a given number of hours (default 24 hours).
 */
export async function snoozeAssignmentAlarm(
  assignmentId: string,
  hours = 24
): Promise<AssignmentAlarm | null> {
  const alarms = await getAssignmentAlarms();
  const existing = alarms[assignmentId];
  if (!existing) return null;

  const newTriggerDate = new Date(Date.now() + hours * 60 * 60 * 1000);

  // Cancel prior notification
  if (existing.notificationId && Platform.OS !== "web") {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
    } catch {}
  }

  // Reschedule notification
  let newNotificationId: string | undefined;
  if (Platform.OS !== "web") {
    await ensureAlarmNotificationChannel();
    try {
      newNotificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ SNOOZED ALARM: ${existing.courseName}`,
          body: `Reminder: ${existing.title}\nDue: ${existing.deadlineRaw}`,
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.MAX,
          categoryIdentifier: "ASSIGNMENT_ALARM_ACTIONS",
          data: {
            type: "ASSIGNMENT_ALARM",
            assignmentId,
            courseName: existing.courseName,
            title: existing.title,
            deadlineRaw: existing.deadlineRaw,
            deepLink: "/(tabs)/assignments",
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: newTriggerDate,
          channelId: Platform.OS === "android" ? ALARM_CHANNEL_ID : undefined,
        },
      });
    } catch {}
  }

  const updatedRecord: AssignmentAlarm = {
    ...existing,
    triggerTimestamp: newTriggerDate.getTime(),
    notificationId: newNotificationId,
    isSnoozed: true,
    snoozedUntil: newTriggerDate.getTime(),
  };

  alarms[assignmentId] = updatedRecord;
  await saveSecureItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));

  return updatedRecord;
}
