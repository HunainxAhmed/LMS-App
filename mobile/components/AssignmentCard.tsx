import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import { Clock, Download, FileText, ChevronRight } from "lucide-react-native";

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
  onDownloadAttachment,
  onPress,
}) => {
  const isMissed =
    (isPassed || submissionStatus === "OVERDUE" || submissionStatus === "MISSED") &&
    !personalCompleted &&
    submissionStatus !== "SUBMITTED";

  let badgeText = "Upcoming";
  let badgeBg = colors.surfaceSecondary;
  let badgeColor = colors.textSecondary;

  if (personalCompleted || submissionStatus === "SUBMITTED") {
    badgeText = "Submitted";
    badgeBg = colors.statusSafeBg;
    badgeColor = colors.statusSafe;
  } else if (isMissed) {
    badgeText = "Missed";
    badgeBg = colors.statusDangerBg;
    badgeColor = colors.statusDanger;
  } else if (daysLeft !== null && daysLeft !== undefined) {
    if (daysLeft === 0) {
      badgeText = "Due Today";
      badgeBg = colors.badgeTodayBg;
      badgeColor = colors.badgeTodayText;
    } else if (daysLeft === 1) {
      badgeText = "Tomorrow";
      badgeBg = colors.badge24hBg;
      badgeColor = colors.badge24hText;
    } else {
      badgeText = `${daysLeft}d left`;
      badgeBg = colors.badgeUpcomingBg;
      badgeColor = colors.badgeUpcomingText;
    }
  }

  return (
    <TouchableOpacity
      style={[styles.card, isMissed && styles.cardMissed]}
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
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {assignmentNumber ? `#${assignmentNumber} ` : ""}
        {title}
      </Text>

      <View style={styles.footerRow}>
        <View style={styles.dateCol}>
          <Clock size={11} color={isMissed ? colors.statusDanger : colors.textMuted} />
          <Text style={[styles.dateText, isMissed && styles.dateTextDanger]}>
            {deadlineRaw || "No deadline stated"}
          </Text>
        </View>

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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardMissed: {
    borderColor: colors.statusDangerBorder,
    backgroundColor: "#fffafa",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  courseTag: {
    flex: 1,
    marginRight: 8,
  },
  courseName: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 19,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
  dateTextDanger: {
    color: colors.statusDanger,
    fontWeight: "700",
  },
  downloadChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.primarySubtle,
    borderWidth: 0.5,
    borderColor: colors.primaryBorder,
  },
  downloadChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
});
