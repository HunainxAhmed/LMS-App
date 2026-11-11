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
  const [activePreset, setActivePreset] = useState<"72h" | "48h" | "24h" | "12h" | "custom">("72h");

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

  // Apply quick preset calculations based on deadline
  const applyPreset = (preset: "72h" | "48h" | "24h" | "12h") => {
    setActivePreset(preset);
    const deadlineMs = parsedDeadline ? parsedDeadline.getTime() : Date.now() + 4 * 24 * 3600 * 1000;
    let offsetHours = 72;
    if (preset === "48h") offsetHours = 48;
    if (preset === "24h") offsetHours = 24;
    if (preset === "12h") offsetHours = 12;

    const targetMs = deadlineMs - offsetHours * 3600 * 1000;
    if (targetMs > Date.now()) {
      setSelectedDate(new Date(targetMs));
    } else {
      // If requested prior time has passed, default to halfway or in 2 hours
      setSelectedDate(new Date(Date.now() + 2 * 3600 * 1000));
    }
  };

  // Time modification helpers
  const adjustDay = (days: number) => {
    setActivePreset("custom");
    const next = new Date(selectedDate.getTime() + days * 24 * 3600 * 1000);
    if (next.getTime() > Date.now()) {
      setSelectedDate(next);
    }
  };

  const adjustHour = (hour24: number) => {
    setActivePreset("custom");
    const next = new Date(selectedDate);
    next.setHours(hour24);
    setSelectedDate(next);
  };

  const adjustMinute = (min: number) => {
    setActivePreset("custom");
    const next = new Date(selectedDate);
    next.setMinutes(min);
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
      const saved = await setAlarm({
        assignmentId: assignment.id,
        courseName,
        title,
        deadlineRaw,
        deadlineIso,
        triggerDate: selectedDate,
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
                <Text style={styles.headerTitle}>Assignment Alarm & Reminder</Text>
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
            {/* Active Alarm Status Banner (If set) */}
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

            {/* Preset Selector */}
            <Text style={styles.sectionTitle}>
              {existingAlarm ? "Change Alarm Reminder Time:" : "Choose Reminder Time:"}
            </Text>
            <Text style={styles.presetHint}>
              Defaults to 72 hours (3 days) before deadline. You can pick any preset or custom time.
            </Text>

            <View style={styles.presetRow}>
              <TouchableOpacity
                style={[styles.presetChip, activePreset === "72h" && styles.presetChipActive]}
                onPress={() => applyPreset("72h")}
                activeOpacity={0.7}
              >
                <Sparkles size={12} color={activePreset === "72h" ? "#b45309" : colors.textSecondary} />
                <Text style={[styles.presetChipText, activePreset === "72h" && styles.presetChipTextActive]}>
                  72h Before (Default)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.presetChip, activePreset === "48h" && styles.presetChipActive]}
                onPress={() => applyPreset("48h")}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, activePreset === "48h" && styles.presetChipTextActive]}>
                  48h Before
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.presetChip, activePreset === "24h" && styles.presetChipActive]}
                onPress={() => applyPreset("24h")}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, activePreset === "24h" && styles.presetChipTextActive]}>
                  24h Before
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.presetChip, activePreset === "12h" && styles.presetChipActive]}
                onPress={() => applyPreset("12h")}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, activePreset === "12h" && styles.presetChipTextActive]}>
                  12h Before
                </Text>
              </TouchableOpacity>
            </View>

            {/* Custom Date Controls */}
            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>DATE</Text>
              <View style={styles.dateSelectorRow}>
                <TouchableOpacity
                  style={styles.dayAdjustBtn}
                  onPress={() => adjustDay(-1)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dayAdjustText}>-1 Day</Text>
                </TouchableOpacity>

                <View style={styles.currentDateDisplay}>
                  <Calendar size={14} color={colors.primary} />
                  <Text style={styles.currentDateText}>{formattedDateStr}</Text>
                </View>

                <TouchableOpacity
                  style={styles.dayAdjustBtn}
                  onPress={() => adjustDay(1)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dayAdjustText}>+1 Day</Text>
                </TouchableOpacity>
              </View>

              {/* Time Controls */}
              <Text style={[styles.pickerLabel, { marginTop: 16 }]}>TIME</Text>
              <View style={styles.timeSelectorRow}>
                {/* Hours selection */}
                <View style={styles.timeColumn}>
                  <Text style={styles.timeSubLabel}>Hour</Text>
                  <View style={styles.chipsWrap}>
                    {[9, 10, 11, 12, 1, 2, 3, 5, 8, 11].map((h) => {
                      const h24 = isPm ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h;
                      const isSelected = currentHour12 === h;
                      return (
                        <TouchableOpacity
                          key={h}
                          style={[styles.miniChip, isSelected && styles.miniChipActive]}
                          onPress={() => adjustHour(h24)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.miniChipText, isSelected && styles.miniChipTextActive]}>
                            {h}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Minutes selection */}
                <View style={styles.timeColumn}>
                  <Text style={styles.timeSubLabel}>Minute</Text>
                  <View style={styles.chipsWrap}>
                    {[0, 15, 30, 45, 59].map((m) => {
                      const isSelected = Math.abs(currentMinute - m) < 5;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[styles.miniChip, isSelected && styles.miniChipActive]}
                          onPress={() => adjustMinute(m)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.miniChipText, isSelected && styles.miniChipTextActive]}>
                            :{m < 10 ? `0${m}` : m}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* AM / PM Toggle */}
                <View style={styles.amPmCol}>
                  <Text style={styles.timeSubLabel}>AM/PM</Text>
                  <TouchableOpacity
                    style={[styles.amPmBtn, !isPm && styles.amPmBtnActive]}
                    onPress={isPm ? toggleAmPm : undefined}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.amPmText, !isPm && styles.amPmTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.amPmBtn, isPm && styles.amPmBtnActive]}
                    onPress={!isPm ? toggleAmPm : undefined}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.amPmText, isPm && styles.amPmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Live Summary Preview Box */}
            <View style={styles.previewBox}>
              <View style={styles.previewIconBox}>
                <Clock size={16} color="#b45309" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewMicroTitle}>ALARM WILL RING ON:</Text>
                <Text style={styles.previewDateText}>
                  {formattedDateStr} • {formattedTimeStr}
                </Text>
                <Text style={styles.previewHint}>
                  Interactive lockscreen notifications allow 24h snooze or instant stop.
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
                  <Bell size={15} color="#fff" />
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
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    width: "100%",
    maxWidth: 440,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    overflow: "hidden",
  },
  header: {
    padding: 18,
    paddingBottom: 12,
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
    paddingTop: 12,
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
    marginBottom: 3,
  },
  presetHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 10,
    lineHeight: 15,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  presetChipActive: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  presetChipTextActive: {
    color: "#b45309",
    fontWeight: "700",
  },
  pickerSection: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.textMuted,
    marginBottom: 8,
  },
  dateSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayAdjustBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dayAdjustText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  currentDateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  currentDateText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  timeSelectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  timeColumn: {
    flex: 2,
  },
  timeSubLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 4,
    fontWeight: "600",
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  miniChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    width: 28,
    height: 26,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  miniChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  miniChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  miniChipTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  amPmCol: {
    flex: 1,
    justifyContent: "flex-end",
    gap: 4,
  },
  amPmBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: "center",
  },
  amPmBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  amPmText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  amPmTextActive: {
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
