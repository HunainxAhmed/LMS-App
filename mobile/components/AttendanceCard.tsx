import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  User,
  Clock,
  Sparkles,
  Info,
} from "lucide-react-native";

export interface AttendanceSessionItem {
  id: string;
  session_date: string;
  day_name?: string;
  slot_info?: string;
  status: string; // PRESENT or ABSENT
  remarks?: string;
}

interface AttendanceCardProps {
  courseCode: string;
  courseTitle: string;
  instructor?: string;
  creditHours?: number;
  totalSemesterHours?: number;
  percentage: number;
  presentHours: number;
  absentHours: number;
  totalHours: number;
  safeMisses: number;
  fineSkips?: number;
  fineAmount?: number;
  riskStatus: string; // SAFE, WARNING, CRITICAL
  sessions?: AttendanceSessionItem[];
}

export const AttendanceCard: React.FC<AttendanceCardProps> = ({
  courseCode,
  courseTitle,
  instructor,
  creditHours = 3,
  totalSemesterHours = 48,
  percentage,
  presentHours,
  absentHours,
  totalHours,
  safeMisses,
  fineSkips = 7,
  fineAmount = 0,
  riskStatus,
  sessions = [],
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterType, setFilterType] = useState<"ALL" | "ABSENT" | "PRESENT">("ALL");

  const isSafe = riskStatus === "SAFE" || percentage >= 75.0;
  const isWarning = (riskStatus === "WARNING" || (percentage >= 60.0 && percentage < 75.0)) && !isSafe;

  const statusLabel = isSafe ? "Safe Zone" : isWarning ? "Attendance Warning" : "Debarred / Critical";
  const statusColor = isSafe ? colors.statusSafe : isWarning ? colors.statusWarning : colors.statusDanger;
  const statusBg = isSafe ? colors.statusSafeBg : isWarning ? colors.statusWarningBg : colors.statusDangerBg;
  const statusBorder = isSafe ? colors.statusSafeBorder : isWarning ? colors.statusWarningBorder : colors.statusDangerBorder;

  // Semester completion percentage (conducted vs total semester hours)
  const quotaHours = totalSemesterHours || (creditHours === 2 ? 32 : 48);
  const conductedPct = Math.min(100, Math.round((totalHours / quotaHours) * 100));

  const filteredSessions = sessions.filter((s) => {
    if (filterType === "ABSENT") return s.status === "ABSENT";
    if (filterType === "PRESENT") return s.status === "PRESENT";
    return true;
  });

  const presentCount = sessions.filter((s) => s.status === "PRESENT").length;
  const absentCount = sessions.filter((s) => s.status === "ABSENT").length;

  return (
    <View style={styles.card}>
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.badgeRow}>
            <View style={styles.courseCodeBadge}>
              <Text style={styles.courseCodeText}>{courseCode}</Text>
            </View>
            <View style={styles.creditPill}>
              <Text style={styles.creditPillText}>{creditHours} Credits</Text>
            </View>
          </View>
          <Text style={styles.courseTitle} numberOfLines={2}>
            {courseTitle}
          </Text>
          {instructor ? (
            <View style={styles.instructorRow}>
              <User size={12} color={colors.textSecondary} />
              <Text style={styles.instructorText} numberOfLines={1}>
                {instructor}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Percentage Gauge Box */}
        <View style={[styles.pctContainer, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <Text style={[styles.pctValue, { color: statusColor }]}>
            {percentage.toFixed(1)}%
          </Text>
          <View style={styles.statusDotRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusMiniText, { color: statusColor }]}>
              {isSafe ? "SAFE" : isWarning ? "WARNING" : "RISK"}
            </Text>
          </View>
        </View>
      </View>

      {/* Progress Track (Conducted vs Quota) */}
      <View style={styles.progressSection}>
        <View style={styles.progressTrackBg}>
          <View
            style={[
              styles.progressFillPresent,
              { width: `${Math.min(100, (presentHours / quotaHours) * 100)}%`, backgroundColor: colors.statusSafe },
            ]}
          />
          {absentHours > 0 && (
            <View
              style={[
                styles.progressFillAbsent,
                { width: `${Math.min(100, (absentHours / quotaHours) * 100)}%`, backgroundColor: colors.statusDanger },
              ]}
            />
          )}
        </View>

        <View style={styles.progressLabelsRow}>
          <Text style={styles.progressLabelItem}>
            <Text style={styles.boldText}>{presentHours} hrs</Text> Present
          </Text>
          <Text style={styles.progressLabelItem}>
            <Text style={[styles.boldText, absentHours > 0 && { color: colors.statusDanger }]}>
              {absentHours} hrs
            </Text>{" "}
            Absent
          </Text>
          <Text style={styles.progressLabelItem}>
            {totalHours} / {quotaHours} hrs ({conductedPct}%)
          </Text>
        </View>
      </View>

      {/* Proprietary Safe Skips Allowance Banner */}
      <View style={[styles.allowanceBanner, safeMisses === 0 && styles.allowanceBannerWarning]}>
        <View style={styles.allowanceLeft}>
          {safeMisses > 0 ? (
            <ShieldCheck size={16} color={colors.statusSafe} />
          ) : (
            <ShieldAlert size={16} color={colors.statusWarning} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.allowanceTitle}>
              {safeMisses > 0
                ? `${safeMisses} Safe Skips Available`
                : "0 Safe Skips Remaining"}
            </Text>
            <Text style={styles.allowanceSub}>
              {safeMisses > 0
                ? `Can miss ${safeMisses} more hours and stay above 75% limit`
                : "At or below 75% attendance threshold. Do not miss classes."}
            </Text>
          </View>
        </View>

        {fineSkips > 0 && safeMisses === 0 && (
          <View style={styles.fineBadge}>
            <Text style={styles.fineBadgeText}>+{fineSkips} hrs w/ Fine</Text>
          </View>
        )}
      </View>

      {/* Detailed Sessions Toggle Button */}
      <TouchableOpacity
        style={styles.expandTrigger}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.expandTriggerLeft}>
          <Calendar size={14} color={colors.primary} />
          <Text style={styles.expandTriggerText}>
            Class Log ({presentCount} Present • {absentCount} Absent)
          </Text>
        </View>
        {isExpanded ? (
          <ChevronUp size={16} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={16} color={colors.textSecondary} />
        )}
      </TouchableOpacity>

      {/* Expandable Session Log Drawer */}
      {isExpanded && (
        <View style={styles.drawerContainer}>
          {/* Filter Pills */}
          <View style={styles.filterChipRow}>
            {(["ALL", "PRESENT", "ABSENT"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  filterType === type && styles.filterChipActive,
                ]}
                onPress={() => setFilterType(type)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === type && styles.filterChipTextActive,
                  ]}
                >
                  {type === "ALL"
                    ? `All (${sessions.length})`
                    : type === "PRESENT"
                    ? `Present (${presentCount})`
                    : `Absent (${absentCount})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Session Rows */}
          {filteredSessions.length === 0 ? (
            <View style={styles.emptySessionState}>
              <Text style={styles.emptySessionText}>No session records in this category.</Text>
            </View>
          ) : (
            filteredSessions.map((s, idx) => {
              const isPres = s.status === "PRESENT";
              const isLast = idx === filteredSessions.length - 1;
              return (
                <View
                  key={s.id || idx}
                  style={[
                    styles.sessionRow,
                    isLast && { borderBottomWidth: 0 },
                    !isPres && styles.sessionRowAbsent,
                  ]}
                >
                  <View style={styles.sessionDateBox}>
                    <Text style={styles.sessionDateText}>{s.session_date}</Text>
                    {s.day_name ? (
                      <Text style={styles.sessionDayText}>{s.day_name}</Text>
                    ) : null}
                  </View>

                  <View style={styles.sessionDetails}>
                    <Text style={styles.sessionSlotText}>
                      {s.slot_info || "Scheduled Lecture"}
                    </Text>
                    {s.remarks ? (
                      <Text style={styles.sessionRemarksText}>{s.remarks}</Text>
                    ) : null}
                  </View>

                  <View
                    style={[
                      styles.sessionStatusBadge,
                      isPres ? styles.sessionStatusPres : styles.sessionStatusAbs,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sessionStatusText,
                        isPres ? styles.sessionStatusPresText : styles.sessionStatusAbsText,
                      ]}
                    >
                      {isPres ? "Present" : "Absent"}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  courseCodeBadge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  courseCodeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1d4ed8",
    fontFamily: "monospace",
  },
  creditPill: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  creditPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 20,
    marginTop: 2,
  },
  instructorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  instructorText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  pctContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 64,
  },
  pctValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusMiniText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  /* Progress Section */
  progressSection: {
    marginBottom: 12,
  },
  progressTrackBg: {
    height: 7,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressFillPresent: {
    height: "100%",
  },
  progressFillAbsent: {
    height: "100%",
  },
  progressLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  progressLabelItem: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  boldText: {
    fontWeight: "700",
    color: colors.textPrimary,
  },

  /* Allowance Banner */
  allowanceBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginBottom: 10,
  },
  allowanceBannerWarning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  allowanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  allowanceTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  allowanceSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  fineBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  fineBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },

  /* Drawer Trigger */
  expandTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  expandTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  expandTriggerText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  /* Session Drawer */
  drawerContainer: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  filterChipRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
  },
  filterChipActive: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: "#1d4ed8",
    fontWeight: "700",
  },
  emptySessionState: {
    paddingVertical: 14,
    alignItems: "center",
  },
  emptySessionText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  sessionRowAbsent: {
    backgroundColor: "#fef2f2",
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  sessionDateBox: {
    width: "28%",
  },
  sessionDateText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sessionDayText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  sessionDetails: {
    flex: 1,
    paddingHorizontal: 6,
  },
  sessionSlotText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  sessionRemarksText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  sessionStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 54,
    alignItems: "center",
  },
  sessionStatusPres: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  sessionStatusAbs: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  sessionStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  sessionStatusPresText: {
    color: "#059669",
  },
  sessionStatusAbsText: {
    color: "#dc2626",
  },
});
