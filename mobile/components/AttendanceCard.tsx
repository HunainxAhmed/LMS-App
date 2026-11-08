import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import {
  ShieldCheck,
  ShieldAlert,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
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

  const statusLabel = isSafe ? "SAFE" : isWarning ? "WARNING" : "CRITICAL";
  const statusColor = isSafe ? colors.statusSafe : isWarning ? colors.statusWarning : colors.statusDanger;
  const statusBg = isSafe ? colors.statusSafeBg : isWarning ? colors.statusWarningBg : colors.statusDangerBg;
  const statusBorder = isSafe ? colors.statusSafeBorder : isWarning ? colors.statusWarningBorder : colors.statusDangerBorder;

  // Semester completion calculation
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
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.courseMeta}>
          <View style={styles.codeRow}>
            <View style={styles.codeCapsule}>
              <Text style={styles.codeText}>{courseCode}</Text>
            </View>
            <View style={styles.creditCapsule}>
              <Text style={styles.creditText}>{creditHours} Cr</Text>
            </View>
          </View>
          <Text style={styles.courseTitle} numberOfLines={2}>
            {courseTitle}
          </Text>
          {instructor ? (
            <View style={styles.instructorRow}>
              <User size={11} color={colors.textMuted} />
              <Text style={styles.instructorText} numberOfLines={1}>
                {instructor}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Circular / Rounded Percentage Badge */}
        <View style={[styles.pctGauge, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <Text style={[styles.pctNumber, { color: statusColor }]}>
            {percentage.toFixed(1)}%
          </Text>
          <View style={styles.statusPillRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusMiniLabel, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Proprietary CampusFlow Safe Skips Shield */}
      <View
        style={[
          styles.shieldBanner,
          safeMisses > 0 ? styles.shieldBannerSafe : styles.shieldBannerWarning,
        ]}
      >
        <View style={styles.shieldIconContainer}>
          {safeMisses > 0 ? (
            <ShieldCheck size={18} color={colors.primary} />
          ) : (
            <ShieldAlert size={18} color={colors.statusWarning} />
          )}
        </View>
        <View style={styles.shieldTextContainer}>
          <Text style={styles.shieldTitle}>
            {safeMisses > 0
              ? `${safeMisses} Safe Skips Remaining`
              : "0 Safe Skips Available"}
          </Text>
          <Text style={styles.shieldSub}>
            {safeMisses > 0
              ? `You can miss ${safeMisses} more hours and stay above 75% threshold.`
              : "Attendance is at risk. Attending all remaining lectures is required."}
          </Text>
        </View>
      </View>

      {/* Modern Multi-Segment Progress Track */}
      <View style={styles.trackContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressPresent,
              { width: `${Math.min(100, (presentHours / quotaHours) * 100)}%` },
            ]}
          />
          {absentHours > 0 && (
            <View
              style={[
                styles.progressAbsent,
                { width: `${Math.min(100, (absentHours / quotaHours) * 100)}%` },
              ]}
            />
          )}
        </View>

        {/* Micro KPI Row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <View style={[styles.kpiDot, { backgroundColor: colors.statusSafe }]} />
            <Text style={styles.kpiLabel}>
              <Text style={styles.kpiBold}>{presentHours}h</Text> Present
            </Text>
          </View>

          <View style={styles.kpiItem}>
            <View style={[styles.kpiDot, { backgroundColor: colors.absentRed }]} />
            <Text style={styles.kpiLabel}>
              <Text style={[styles.kpiBold, absentHours > 0 && { color: colors.absentRed }]}>
                {absentHours}h
              </Text>{" "}
              Absent
            </Text>
          </View>

          <View style={styles.kpiItemRight}>
            <Text style={styles.kpiTotalText}>
              {totalHours} / {quotaHours}h ({conductedPct}%)
            </Text>
          </View>
        </View>
      </View>

      {/* Class Log Expand Trigger */}
      <TouchableOpacity
        style={styles.expandTrigger}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.expandLeft}>
          <Calendar size={13} color={colors.primary} />
          <Text style={styles.expandText}>
            Class History ({presentCount} Present • {absentCount} Absent)
          </Text>
        </View>
        {isExpanded ? (
          <ChevronUp size={16} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={16} color={colors.textSecondary} />
        )}
      </TouchableOpacity>

      {/* Expanded Class Sessions List */}
      {isExpanded && (
        <View style={styles.expandedLog}>
          {/* Sub-filters: All, Absent, Present */}
          <View style={styles.logFilterRow}>
            {(["ALL", "ABSENT", "PRESENT"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.logFilterPill,
                  filterType === t && styles.logFilterPillActive,
                ]}
                onPress={() => setFilterType(t)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.logFilterPillText,
                    filterType === t && styles.logFilterPillTextActive,
                  ]}
                >
                  {t === "ALL" ? `All (${sessions.length})` : t === "ABSENT" ? `Absent (${absentCount})` : `Present (${presentCount})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredSessions.length === 0 ? (
            <View style={styles.emptySessions}>
              <Text style={styles.emptySessionsText}>No classes match this filter.</Text>
            </View>
          ) : (
            filteredSessions.map((s, idx) => {
              const isPresent = s.status === "PRESENT";
              return (
                <View
                  key={s.id || idx}
                  style={[
                    styles.sessionRow,
                    idx === filteredSessions.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.sessionDateCol}>
                    <Text style={styles.sessionDate}>{s.session_date}</Text>
                    {s.slot_info ? (
                      <Text style={styles.sessionSlot}>{s.slot_info}</Text>
                    ) : null}
                  </View>

                  <View
                    style={[
                      styles.sessionStatusBadge,
                      isPresent ? styles.sessionStatusPresent : styles.sessionStatusAbsent,
                    ]}
                  >
                    {isPresent ? (
                      <CheckCircle2 size={12} color={colors.statusSafe} />
                    ) : (
                      <XCircle size={12} color={colors.absentRed} />
                    )}
                    <Text
                      style={[
                        styles.sessionStatusText,
                        isPresent ? { color: colors.statusSafe } : { color: colors.absentRed },
                      ]}
                    >
                      {isPresent ? "Present" : "Absent"}
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
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  courseMeta: {
    flex: 1,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  codeCapsule: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.surfaceBorder,
  },
  codeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  creditCapsule: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  creditText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 20,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  instructorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  instructorText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  pctGauge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 78,
  },
  pctNumber: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statusPillRow: {
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
  statusMiniLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  shieldBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  shieldBannerSafe: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primaryBorder,
  },
  shieldBannerWarning: {
    backgroundColor: colors.statusWarningBg,
    borderColor: colors.statusWarningBorder,
  },
  shieldIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  shieldTextContainer: {
    flex: 1,
  },
  shieldTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  shieldSub: {
    fontSize: 10.5,
    color: colors.textSecondary,
    marginTop: 1,
    lineHeight: 14,
  },
  trackContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceTertiary,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressPresent: {
    height: "100%",
    backgroundColor: colors.statusSafe,
  },
  progressAbsent: {
    height: "100%",
    backgroundColor: colors.absentRed,
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 14,
  },
  kpiItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  kpiItemRight: {
    marginLeft: "auto",
  },
  kpiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kpiLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  kpiBold: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  kpiTotalText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  expandTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  expandLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  expandText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  expandedLog: {
    marginTop: 10,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 10,
  },
  logFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  logFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.surfaceBorder,
  },
  logFilterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  logFilterPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  logFilterPillTextActive: {
    color: "#ffffff",
  },
  emptySessions: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptySessionsText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  sessionDateCol: {
    flex: 1,
  },
  sessionDate: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sessionSlot: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  sessionStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sessionStatusPresent: {
    backgroundColor: colors.presentGreenBg,
  },
  sessionStatusAbsent: {
    backgroundColor: colors.absentRedBg,
  },
  sessionStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },
});
