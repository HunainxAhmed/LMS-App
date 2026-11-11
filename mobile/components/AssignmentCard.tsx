import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import { Clock, Download, FileText, ChevronRight, AlarmClock, BellRing, CheckCircle2 } from "lucide-react-native";

interface AssignmentCardProps {
  id: string;
  courseName: string;
  assignmentNumber: string;
  title: string;
  deadlineRaw: string;
  daysLeft?: number | null;
  isPassed: boolean;
  submissionStatus: string;
  personalCompleted: boolean;
  showManualCheck?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  alarmScheduledTime?: number;
  isAlarmSnoozed?: boolean;
  onSetAlarm?: () => void;
  onToggleComplete?: (completed: boolean) => void;
  onDownloadAttachment?: () => void;
  onPress?: () => void;
}

export const AssignmentCard: React.FC<AssignmentCardProps> = ({
  courseName,
  assignmentNumber,
  title,
  deadlineRaw,
  daysLeft,
  isPassed,
  submissionStatus,
  personalCompleted,
  attachmentUrl,
  attachmentName,
  alarmScheduledTime,
  isAlarmSnoozed,
  onSetAlarm,
  onDownloadAttachment,
  onPress,
}) => {
  const isSubmitted = personalCompleted || submissionStatus === "SUBMITTED";
  const isMissed =
    (isPassed || submissionStatus === "OVERDUE" || submissionStatus === "MISSED") && !isSubmitted;

  let badgeText = "Pending";
  let badgeBg = "#eff6ff";
  let badgeColor = "#1d4ed8";
  let dotColor = "#3b82f6";

  if (isSubmitted) {
    badgeText = "Submitted";
    badgeBg = "#ecfdf5";
    badgeColor = "#059669";
    dotColor = "#10b981";
  } else if (isMissed) {
    badgeText = "Missed";
    badgeBg = "#fff1f2";
    badgeColor = "#e11d48";
    dotColor = "#f43f5e";
  } else if (daysLeft !== null && daysLeft !== undefined) {
    if (daysLeft === 0) {
      badgeText = "Due Today";
      badgeBg = "#ffe4e6";
      badgeColor = "#be123c";
      dotColor = "#e11d48";
    } else if (daysLeft === 1) {
      badgeText = "Tomorrow";
      badgeBg = "#ffedd5";
      badgeColor = "#c2410c";
      dotColor = "#f97316";
    } else {
      badgeText = `${daysLeft}d left`;
      badgeBg = "#eff6ff";
      badgeColor = "#1d4ed8";
      dotColor = "#3b82f6";
    }
  }

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isMissed && styles.cardMissed,
        isSubmitted && styles.cardSubmitted,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={styles.cardHeader}>
        <View style={styles.courseTag}>
          <Text style={styles.courseName} numberOfLines={1}>
            {courseName}
          </Text>
        </View>

        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {assignmentNumber ? `#${assignmentNumber} ` : ""}
        {title}
      </Text>

      <View style={styles.footerRow}>
        <View style={styles.dateCol}>
          <Clock size={12} color={isMissed ? "#e11d48" : "#64748b"} />
          <Text style={[styles.dateText, isMissed && styles.dateTextDanger]} numberOfLines={1}>
            {deadlineRaw || "No deadline stated"}
          </Text>
        </View>

        <View style={styles.footerActionRow}>
          {onSetAlarm && !isMissed && !isSubmitted && (
            <TouchableOpacity
              style={alarmScheduledTime ? styles.alarmChipActive : styles.alarmChip}
              onPress={onSetAlarm}
              activeOpacity={0.7}
            >
              <AlarmClock
                size={12}
                color={alarmScheduledTime ? "#b45309" : "#64748b"}
              />
              <Text
                style={alarmScheduledTime ? styles.alarmChipTextActive : styles.alarmChipText}
              >
                {alarmScheduledTime
                  ? `${isAlarmSnoozed ? "Snoozed" : "Alarm"}: ${new Date(
                      alarmScheduledTime
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`
                  : "Set Alarm"}
              </Text>
            </TouchableOpacity>
          )}

          {attachmentUrl && onDownloadAttachment && (
            <TouchableOpacity
              style={styles.downloadChip}
              onPress={onDownloadAttachment}
              activeOpacity={0.7}
            >
              <Download size={11} color={colors.primary} />
              <Text style={styles.downloadChipText} numberOfLines={1}>
                Brief
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardMissed: {
    borderColor: "#fecdd3",
    backgroundColor: "#fffafa",
  },
  cardSubmitted: {
    borderColor: "#bbf7d0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  courseTag: {
    flex: 1,
    marginRight: 8,
  },
  courseName: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 21,
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  dateCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  dateText: {
    fontSize: 11.5,
    color: "#64748b",
    fontWeight: "600",
  },
  dateTextDanger: {
    color: "#e11d48",
    fontWeight: "700",
  },
  downloadChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(4, 120, 87, 0.08)",
  },
  downloadChipText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: colors.primary,
  },
  footerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  alarmChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  alarmChipActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  alarmChipText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#475569",
  },
  alarmChipTextActive: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#b45309",
  },
});
