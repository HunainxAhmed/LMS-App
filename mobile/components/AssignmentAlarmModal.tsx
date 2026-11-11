import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { colors } from "../theme/colors";
import {
  AlarmClock,
  Bell,
  X,
  Check,
  Calendar,
  Clock,
  Sparkles,
  RotateCcw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
} from "lucide-react-native";
import {
  AssignmentAlarm,
  computeDefaultAlarmDate,
  parseAssignmentDeadline,
} from "../services/alarmService";
import { useAlarmStore } from "../stores/alarmStore";

interface AssignmentAlarmModalProps {
  visible: boolean;
  assignment: {
    id: string;
    title: string;
    course_name?: string;
    courseName?: string;
    deadline?: string;
    extended_deadline?: string;
    deadline_raw?: string;
    deadlineRaw?: string;
  } | null;
  onClose: () => void;
  onAlarmSaved?: (alarm: AssignmentAlarm) => void;
}

export const AssignmentAlarmModal: React.FC<AssignmentAlarmModalProps> = ({
  visible,
  assignment,
  onClose,
  onAlarmSaved,
}) => {
  const { alarms, setAlarm, cancelAlarm, snoozeAlarm, isLoading } = useAlarmStore();

  const assignmentId = assignment?.id || "";
  const existingAlarm = assignmentId ? alarms[assignmentId] : null;

  const title = assignment?.title || "Assignment";
  const courseName = assignment?.course_name || assignment?.courseName || "Coursework";
  const deadlineRaw = assignment?.deadline_raw || assignment?.deadlineRaw || "No deadline stated";
  const deadlineIso = assignment?.deadline;
  const extDeadlineIso = assignment?.extended_deadline;

  // Selected trigger date state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activePreset, setActivePreset] = useState<"1m" | "1h" | "72h" | "48h" | "24h" | "custom">("72h");

  // Re-initialize default 72h-prior date whenever modal opens for this assignment
  useEffect(() => {
    if (visible && assignment) {
      if (existingAlarm) {
        setSelectedDate(new Date(existingAlarm.triggerTimestamp));
        setActivePreset("custom");
      } else {
        const defaultDate = computeDefaultAlarmDate(deadlineIso, extDeadlineIso, deadlineRaw);
        setSelectedDate(defaultDate);
        setActivePreset("72h");
      }
    }
  }, [visible, assignmentId, existingAlarm?.triggerTimestamp]);

  const parsedDeadline = useMemo(() => {
    return parseAssignmentDeadline(deadlineIso, extDeadlineIso, deadlineRaw);
  }, [deadlineIso, extDeadlineIso, deadlineRaw]);

  // Compute preset dates for quick preview
  const presetDates = useMemo(() => {
    const deadlineMs = parsedDeadline ? parsedDeadline.getTime() : Date.now() + 4 * 24 * 3600 * 1000;
    const now = Date.now();

    const getDateForHours = (h: number) => {
      const ms = deadlineMs - h * 3600 * 1000;
      return ms > now ? new Date(ms) : new Date(now + 2 * 3600 * 1000);
    };

    return {
      "1m": new Date(now + 60 * 1000), // 1 minute from now (for immediate test)
      "1h": new Date(now + 60 * 60 * 1000), // 1 hour from now
      "72h": getDateForHours(72),
      "48h": getDateForHours(48),
      "24h": getDateForHours(24),
    };
  }, [parsedDeadline, visible]);

  const applyPreset = (preset: "1m" | "1h" | "72h" | "48h" | "24h" | "custom") => {
    setActivePreset(preset);
    if (preset !== "custom") {
      setSelectedDate(presetDates[preset]);
    }
  };

  // Adjust date by days (allows selecting today and stepping forward)
  const adjustDay = (days: number) => {
    setActivePreset("custom");
    const next = new Date(selectedDate.getTime() + days * 24 * 3600 * 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Allow user to step back to Today or any future day
    if (next.getTime() >= startOfToday.getTime()) {
      // If moving to today and time has already passed, adjust to 15 mins in future
      if (next.getTime() <= Date.now()) {
        const bumped = new Date(Date.now() + 15 * 60 * 1000);
        next.setHours(bumped.getHours(), bumped.getMinutes(), 0, 0);
      }
      setSelectedDate(next);
    }
  };

  // Stepper adjustments for time
  const adjustHourBy = (delta: number) => {
    setActivePreset("custom");
    const next = new Date(selectedDate);
    let h = next.getHours() + delta;
    if (h < 0) h = 23;
    if (h > 23) h = 0;
    next.setHours(h);
    setSelectedDate(next);
  };

  const adjustMinuteBy = (delta: number) => {
    setActivePreset("custom");
    const next = new Date(selectedDate);
    let m = next.getMinutes() + delta;
    if (m < 0) m = 45;
    if (m > 59) m = 0;
    next.setMinutes(m);
    setSelectedDate(next);
  };

  const toggleAmPm = () => {
    setActivePreset("custom");
    const next = new Date(selectedDate);
    const h = next.getHours();
    next.setHours(h >= 12 ? h - 12 : h + 12);
    setSelectedDate(next);
  };

  const handleSaveAlarm = async () => {
    if (!assignment) return;
    try {
      let finalTriggerDate = selectedDate;
      // If trigger time is within the next 15 seconds or slightly in past, ensure it is at least 30s in future
      if (finalTriggerDate.getTime() <= Date.now() + 15000) {
        finalTriggerDate = new Date(Date.now() + 45000);
      }

      const saved = await setAlarm({
        assignmentId: assignment.id,
        courseName,
        title,
        deadlineRaw,
        deadlineIso,
        triggerDate: finalTriggerDate,
      });
      if (onAlarmSaved) onAlarmSaved(saved);
      onClose();
    } catch (e) {
      console.warn("Failed to set alarm:", e);
    }
  };

  const handleCancelAlarm = async () => {
    if (!assignment) return;
    try {
      await cancelAlarm(assignment.id);
      onClose();
    } catch (e) {
      console.warn("Failed to cancel alarm:", e);
    }
  };

  const handleSnooze24h = async () => {
    if (!assignment) return;
    try {
      const updated = await snoozeAlarm(assignment.id, 24);
      if (updated && onAlarmSaved) onAlarmSaved(updated);
      onClose();
    } catch (e) {
      console.warn("Failed to snooze alarm:", e);
    }
  };

  if (!visible || !assignment) return null;

  const currentHour24 = selectedDate.getHours();
  const isPm = currentHour24 >= 12;
  const currentHour12 = currentHour24 % 12 === 0 ? 12 : currentHour24 % 12;
  const currentMinute = selectedDate.getMinutes();

  const formattedDateStr = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formattedTimeStr = selectedDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconCircle}>
                <AlarmClock size={20} color="#b45309" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Set Assignment Alarm</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {courseName}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Assignment Info Pill */}
            <View style={styles.infoBox}>
              <Text style={styles.assignmentTitle} numberOfLines={2}>
                {title}
              </Text>
              <View style={styles.dueRow}>
                <Calendar size={12} color={colors.textMuted} />
                <Text style={styles.dueText}>Deadline: {deadlineRaw}</Text>
              </View>
            </View>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Active Alarm Banner (If previously set) */}
            {existingAlarm && (
              <View style={styles.existingAlarmBanner}>
                <View style={styles.existingAlarmHeader}>
                  <Bell size={16} color="#059669" />
                  <Text style={styles.existingAlarmTitle}>
                    {existingAlarm.isSnoozed ? "Alarm Snoozed" : "Active Alarm Scheduled"}
                  </Text>
                </View>
                <Text style={styles.existingAlarmTime}>
                  ⏰{" "}
                  {new Date(existingAlarm.triggerTimestamp).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  at{" "}
                  {new Date(existingAlarm.triggerTimestamp).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>

                {/* Snooze & Stop Quick Actions */}
                <View style={styles.quickActionRow}>
                  <TouchableOpacity
                    style={styles.snoozeBtn}
                    onPress={handleSnooze24h}
                    activeOpacity={0.8}
                    disabled={isLoading}
                  >
                    <RotateCcw size={13} color="#2563eb" />
                    <Text style={styles.snoozeBtnText}>Snooze 24h</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stopBtn}
                    onPress={handleCancelAlarm}
                    activeOpacity={0.8}
                    disabled={isLoading}
                  >
                    <Trash2 size={13} color="#dc2626" />
                    <Text style={styles.stopBtnText}>Stop Alarm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Clean Preset Selection Cards */}
            <Text style={styles.sectionTitle}>
              {existingAlarm ? "Change Alarm Reminder Time:" : "Select Reminder Time:"}
            </Text>

            <View style={styles.presetCardsContainer}>
              {/* 72h Before (Default & Recommended) */}
              <TouchableOpacity
                style={[styles.presetCard, activePreset === "72h" && styles.presetCardActive]}
                onPress={() => applyPreset("72h")}
                activeOpacity={0.7}
              >
                <View style={styles.presetCardLeft}>
                  <View style={[styles.presetRadio, activePreset === "72h" && styles.presetRadioActive]}>
                    {activePreset === "72h" && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <View style={styles.presetTitleRow}>
                      <Text style={[styles.presetTitle, activePreset === "72h" && styles.presetTitleActive]}>
                        72 Hours Before
                      </Text>
                      <View style={styles.recommendBadge}>
                        <Sparkles size={10} color="#b45309" />
                        <Text style={styles.recommendText}>Default</Text>
                      </View>
                    </View>
                    <Text style={styles.presetTimeSubtitle}>
                      {presetDates["72h"].toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      •{" "}
                      {presetDates["72h"].toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* 48h Before */}
              <TouchableOpacity
                style={[styles.presetCard, activePreset === "48h" && styles.presetCardActive]}
                onPress={() => applyPreset("48h")}
                activeOpacity={0.7}
              >
                <View style={styles.presetCardLeft}>
                  <View style={[styles.presetRadio, activePreset === "48h" && styles.presetRadioActive]}>
                    {activePreset === "48h" && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <Text style={[styles.presetTitle, activePreset === "48h" && styles.presetTitleActive]}>
                      48 Hours Before (2 Days)
                    </Text>
                    <Text style={styles.presetTimeSubtitle}>
                      {presetDates["48h"].toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      •{" "}
                      {presetDates["48h"].toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* 24h Before */}
              <TouchableOpacity
                style={[styles.presetCard, activePreset === "24h" && styles.presetCardActive]}
                onPress={() => applyPreset("24h")}
                activeOpacity={0.7}
              >
                <View style={styles.presetCardLeft}>
                  <View style={[styles.presetRadio, activePreset === "24h" && styles.presetRadioActive]}>
                    {activePreset === "24h" && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <Text style={[styles.presetTitle, activePreset === "24h" && styles.presetTitleActive]}>
                      24 Hours Before (1 Day)
                    </Text>
                    <Text style={styles.presetTimeSubtitle}>
                      {presetDates["24h"].toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      •{" "}
                      {presetDates["24h"].toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* In 1 Hour */}
              <TouchableOpacity
                style={[styles.presetCard, activePreset === "1h" && styles.presetCardActive]}
                onPress={() => applyPreset("1h")}
                activeOpacity={0.7}
              >
                <View style={styles.presetCardLeft}>
                  <View style={[styles.presetRadio, activePreset === "1h" && styles.presetRadioActive]}>
                    {activePreset === "1h" && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <Text style={[styles.presetTitle, activePreset === "1h" && styles.presetTitleActive]}>
                      In 1 Hour (Today)
                    </Text>
                    <Text style={styles.presetTimeSubtitle}>
                      {presetDates["1h"].toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      • Quick reminder today
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* ⚡️ Test Alarm (In 1 Minute) */}
              <TouchableOpacity
                style={[styles.presetCard, activePreset === "1m" && styles.presetCardActive]}
                onPress={() => applyPreset("1m")}
                activeOpacity={0.7}
              >
                <View style={styles.presetCardLeft}>
                  <View style={[styles.presetRadio, activePreset === "1m" && styles.presetRadioActive]}>
                    {activePreset === "1m" && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <View style={styles.presetTitleRow}>
                      <Text style={[styles.presetTitle, activePreset === "1m" && styles.presetTitleActive]}>
                        ⚡️ Test Alarm (In 1 Minute)
                      </Text>
                    </View>
                    <Text style={styles.presetTimeSubtitle}>
                      Fires at{" "}
                      {presetDates["1m"].toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })}{" "}
                      • Instant ring verification
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Custom Date & Time */}
              <TouchableOpacity
                style={[styles.presetCard, activePreset === "custom" && styles.presetCardActive]}
                onPress={() => applyPreset("custom")}
                activeOpacity={0.7}
              >
                <View style={styles.presetCardLeft}>
                  <View style={[styles.presetRadio, activePreset === "custom" && styles.presetRadioActive]}>
                    {activePreset === "custom" && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <Text style={[styles.presetTitle, activePreset === "custom" && styles.presetTitleActive]}>
                      Custom Date & Time
                    </Text>
                    <Text style={styles.presetTimeSubtitle}>Adjust day, hour, and minute manually</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* Custom Date & Time Controls (Shown when Custom is selected) */}
            {activePreset === "custom" && (
              <View style={styles.customBox}>
                {/* Date Stepper */}
                <Text style={styles.stepperSectionLabel}>DATE</Text>
                <View style={styles.dateBar}>
                  <TouchableOpacity
                    style={styles.arrowBtn}
                    onPress={() => adjustDay(-1)}
                    activeOpacity={0.7}
                  >
                    <ChevronLeft size={18} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <View style={styles.dateBarCenter}>
                    <Calendar size={15} color={colors.primary} />
                    <Text style={styles.dateBarText}>{formattedDateStr}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.arrowBtn}
                    onPress={() => adjustDay(1)}
                    activeOpacity={0.7}
                  >
                    <ChevronRight size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                {/* Digital Clock Stepper */}
                <Text style={[styles.stepperSectionLabel, { marginTop: 14 }]}>TIME</Text>
                <View style={styles.clockRow}>
                  {/* Hour Stepper */}
                  <View style={styles.clockDigitBox}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => adjustHourBy(1)}
                      activeOpacity={0.7}
                    >
                      <Plus size={14} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.clockDigitText}>
                      {currentHour12 < 10 ? `0${currentHour12}` : currentHour12}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => adjustHourBy(-1)}
                      activeOpacity={0.7}
                    >
                      <Minus size={14} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.clockDigitLabel}>HOUR</Text>
                  </View>

                  <Text style={styles.clockColon}>:</Text>

                  {/* Minute Stepper */}
                  <View style={styles.clockDigitBox}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => adjustMinuteBy(15)}
                      activeOpacity={0.7}
                    >
                      <Plus size={14} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.clockDigitText}>
                      {currentMinute < 10 ? `0${currentMinute}` : currentMinute}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => adjustMinuteBy(-15)}
                      activeOpacity={0.7}
                    >
                      <Minus size={14} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.clockDigitLabel}>MIN</Text>
                  </View>

                  {/* AM / PM Toggle */}
                  <View style={styles.amPmContainer}>
                    <TouchableOpacity
                      style={[styles.amPmPill, !isPm && styles.amPmPillActive]}
                      onPress={isPm ? toggleAmPm : undefined}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.amPmPillText, !isPm && styles.amPmPillTextActive]}>
                        AM
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.amPmPill, isPm && styles.amPmPillActive]}
                      onPress={!isPm ? toggleAmPm : undefined}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.amPmPillText, isPm && styles.amPmPillTextActive]}>
                        PM
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Live Alarm Confirmation Banner */}
            <View style={styles.previewBox}>
              <View style={styles.previewIconBox}>
                <Clock size={18} color="#b45309" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewMicroTitle}>ALARM WILL ALERT YOU ON:</Text>
                <Text style={styles.previewDateText}>
                  {formattedDateStr} • {formattedTimeStr}
                </Text>
                <Text style={styles.previewHint}>
                  Rings with alarm sound & vibration. Includes 24h lockscreen snooze.
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Dismiss</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveAlarm}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Bell size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>
                    {existingAlarm ? "Update Alarm" : "Set Assignment Alarm"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    width: "100%",
    maxWidth: 440,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
    overflow: "hidden",
  },
  header: {
    padding: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    backgroundColor: colors.surfaceSecondary,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  infoBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  assignmentTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 18,
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  dueText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
  scrollBody: {
    padding: 18,
    paddingTop: 14,
  },
  existingAlarmBanner: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  existingAlarmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  existingAlarmTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
    textTransform: "uppercase",
  },
  existingAlarmTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#065f46",
    marginBottom: 10,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  snoozeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    paddingVertical: 7,
  },
  snoozeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
  },
  stopBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    paddingVertical: 7,
  },
  stopBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  presetCardsContainer: {
    gap: 8,
    marginBottom: 14,
  },
  presetCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.2,
    borderColor: colors.surfaceBorder,
    borderRadius: 14,
    padding: 12,
  },
  presetCardActive: {
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
  },
  presetCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  presetRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  presetRadioActive: {
    borderColor: "#b45309",
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#b45309",
  },
  presetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  presetTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  presetTitleActive: {
    fontWeight: "700",
    color: "#92400e",
  },
  recommendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  recommendText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },
  presetTimeSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: "500",
  },
  customBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 14,
  },
  stepperSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.textMuted,
    marginBottom: 8,
  },
  dateBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  dateBarCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateBarText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  clockDigitBox: {
    alignItems: "center",
    gap: 4,
  },
  stepBtn: {
    width: 32,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  clockDigitText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    minWidth: 36,
    textAlign: "center",
    paddingVertical: 2,
  },
  clockDigitLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  clockColon: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 18,
  },
  amPmContainer: {
    gap: 6,
    marginLeft: 6,
    marginBottom: 14,
  },
  amPmPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  amPmPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  amPmPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  amPmPillTextActive: {
    color: "#fff",
  },
  previewBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  previewIconBox: {
    marginTop: 2,
  },
  previewMicroTitle: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#b45309",
    marginBottom: 2,
  },
  previewDateText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 3,
  },
  previewHint: {
    fontSize: 10,
    color: "#b45309",
    lineHeight: 14,
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
