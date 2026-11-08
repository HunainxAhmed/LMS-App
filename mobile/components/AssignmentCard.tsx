import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import { Clock, Download, CheckSquare, Square, FileText } from "lucide-react-native";

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
  showManualCheck = false,
  attachmentUrl,
  attachmentName,
  onToggleComplete,
  onDownloadAttachment,
}) => {
  // Determine urgency badge & missed status
  const isMissed = (isPassed || submissionStatus === "OVERDUE" || submissionStatus === "MISSED") && !personalCompleted && submissionStatus !== "SUBMITTED";

  let badgeText = "Upcoming";
  let badgeBg = "#eff6ff";
  let badgeColor = "#2563eb";
  let badgeDot = "#2563eb";

  if (personalCompleted || submissionStatus === "SUBMITTED") {
    badgeText = "Submitted";
    badgeBg = "#ecfdf5";
    badgeColor = "#059669";
    badgeDot = "#059669";
  } else if (isMissed) {
    badgeText = "Missed";
    badgeBg = "#fef2f2";
    badgeColor = "#dc2626";
    badgeDot = "#dc2626";
  } else if (daysLeft !== null && daysLeft !== undefined) {
    if (daysLeft === 0) {
      badgeText = "Due Today";
      badgeBg = "#fee2e2";
      badgeColor = "#991b1b";
      badgeDot = "#dc2626";
    } else if (daysLeft === 1) {
      badgeText = "Due Tomorrow";
      badgeBg = "#ffedd5";
      badgeColor = "#9a3412";
      badgeDot = "#d97706";
    } else if (daysLeft <= 2) {
      badgeText = "2 days left";
      badgeBg = "#fef3c7";
      badgeColor = "#92400e";
      badgeDot = "#d97706";
    } else {
      badgeText = `${daysLeft} days left`;
      badgeBg = "#f1f5f9";
      badgeColor = "#475569";
      badgeDot = "#64748b";
    }
  }

  return (
    <View style={[styles.card, isMissed && styles.cardMissed]}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.courseName} numberOfLines={1}>
          {courseName}
        </Text>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <View style={[styles.badgeDot, { backgroundColor: badgeDot }]} />
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={[styles.title, personalCompleted && styles.completedText]} numberOfLines={2}>
        {assignmentNumber ? `#${assignmentNumber} ` : ""}
        {title}
      </Text>

      {/* Deadline Row */}
      <View style={styles.deadlineRow}>
        <Clock size={12} color={isMissed ? colors.statusDanger : colors.textMuted} />
        <Text style={[styles.deadlineText, isMissed && { color: colors.statusDanger, fontWeight: "600" }]}>
          {deadlineRaw || "No deadline stated"}
        </Text>
      </View>

      {/* Actions & Attachment */}
      {attachmentUrl ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={onDownloadAttachment}
            activeOpacity={0.7}
          >
            <Download size={12} color={colors.primary} />
            <Text style={styles.downloadText} numberOfLines={1}>
              {attachmentName || "Attachment"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardMissed: {
    borderColor: "#fecaca",
    backgroundColor: "#fffafa",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  courseName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: 6,
  },
  completedText: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  deadlineText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorderLight,
    paddingTop: 8,
    marginTop: 8,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  downloadText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },
});
