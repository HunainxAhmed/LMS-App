import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from "react-native";
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
  Sparkles,
} from "lucide-react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const isSafe = riskStatus === "SAFE" || percentage >= 75.0;
  const isWarning = (riskStatus === "WARNING" || (percentage >= 65.0 && percentage < 75.0)) && !isSafe;

  const statusLabel = isSafe ? "SAFE" : isWarning ? "WARNING" : "CRITICAL";
  const statusColor = isSafe ? "#059669" : isWarning ? "#d97706" : "#e11d48";
  const statusBg = isSafe ? "#ecfdf5" : isWarning ? "#fffbeb" : "#fff1f2";
  const statusBorder = isSafe ? "#a7f3d0" : isWarning ? "#fde68a" : "#fecdd3";

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
              <Text style={styles.creditText}>{creditHours} Credits</Text>
            </View>
          </View>
          <Text style={styles.courseTitle} numberOfLines={2}>
            {courseTitle}
          </Text>
          {instructor ? (
            <View style={styles.instructorRow}>
              <User size={12} color="#64748b" />
              <Text style={styles.instructorText} numberOfLines={1}>
                {instructor}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Circular / Rounded Modern Percentage Badge */}
        <View style={[styles.pctGauge, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <Text style={[styles.pctNumber, { color: statusColor }]}>
            {percentage.toFixed(1)}%
          </Text>
          <View style={[styles.statusTag, { backgroundColor: statusColor }]}>
            <Text style={styles.statusTagText}>{statusLabel}</Text>
          </View>
        </View>
      </View>

      {/* Proprietary Safe Skips Shield Card */}
      <View
        style={[
          styles.shieldCard,
          safeMisses > 0 ? styles.shieldCardSafe : styles.shieldCardWarning,
        ]}
      >
        <View style={styles.shieldIconWrap}>
          {safeMisses > 0 ? (
            <ShieldCheck size={20} color="#059669" />
          ) : (
            <ShieldAlert size={20} color="#d97706" />
          )}
        </View>
        <View style={styles.shieldContent}>
          <Text style={styles.shieldTitle}>
            {safeMisses > 0
              ? `${safeMisses} Safe Miss${safeMisses === 1 ? "" : "es"} Available`
              : "0 Safe Misses Available"}
          </Text>
          <Text style={styles.shieldSub}>
            {safeMisses > 0
              ? `You can miss ${safeMisses} more hours and maintain your 75% threshold.`
              : "Attendance is in warning zone. Attending all remaining sessions is required."}
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

        {/* Modern 3-Column Micro Stat Pills */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiPill, styles.kpiPillPresent]}>
            <View style={[styles.kpiDot, { backgroundColor: "#059669" }]} />
            <Text style={styles.kpiText}>
              <Text style={styles.kpiBold}>{presentHours}h</Text> Present
            </Text>
          </View>

          <View style={[styles.kpiPill, absentHours > 0 ? styles.kpiPillAbsent : styles.kpiPillNeutral]}>
            <View style={[styles.kpiDot, { backgroundColor: absentHours > 0 ? "#e11d48" : "#94a3b8" }]} />
            <Text style={[styles.kpiText, absentHours > 0 && { color: "#be123c" }]}>
              <Text style={styles.kpiBold}>{absentHours}h</Text> Absent
            </Text>
          </View>

          <View style={[styles.kpiPill, styles.kpiPillNeutral]}>
            <Text style={styles.kpiTotalText}>
              {totalHours}/{quotaHours}h ({conductedPct}%)
            </Text>
          </View>
        </View>
      </View>

      {/* Class Log Expand Trigger */}
      <TouchableOpacity
        style={styles.expandTrigger}
        onPress={toggleExpand}
        activeOpacity={0.7}
      >
        <View style={styles.expandLeft}>
          <Calendar size={14} color={colors.primary} />
          <Text style={styles.expandText}>
            Class History ({presentCount} Present • {absentCount} Absent)
          </Text>
        </View>
        {isExpanded ? (
          <ChevronUp size={16} color="#64748b" />
        ) : (
          <ChevronDown size={16} color="#64748b" />
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
                  {t === "ALL"
                    ? `All (${sessions.length})`
                    : t === "ABSENT"
                    ? `Absent (${absentCount})`
                    : `Present (${presentCount})`}
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
                      styles.sessionBadge,
                      isPresent ? styles.sessionBadgePresent : styles.sessionBadgeAbsent,
                    ]}
                  >
                    {isPresent ? (
                      <CheckCircle2 size={12} color="#059669" />
                    ) : (
                      <XCircle size={12} color="#e11d48" />
                    )}
                    <Text
                      style={[
                        styles.sessionBadgeText,
                        isPresent ? styles.sessionTextPresent : styles.sessionTextAbsent,
                      ]}
                    >
                      {isPresent ? "PRESENT" : "ABSENT"}
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
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.07)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
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
    backgroundColor: "rgba(4, 120, 87, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  codeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.4,
  },
  creditCapsule: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  creditText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748b",
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 22,
    letterSpacing: -0.2,
    marginBottom: 5,
  },
  instructorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  instructorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  pctGauge: {
    width: 78,
    height: 78,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  pctNumber: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  statusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  statusTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  shieldCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    marginTop: 14,
    borderWidth: 1,
    gap: 10,
  },
  shieldCardSafe: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  shieldCardWarning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  shieldIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  shieldContent: {
    flex: 1,
  },
  shieldTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
  },
  shieldSub: {
    fontSize: 11,
    color: "#475569",
    lineHeight: 15,
  },
  trackContainer: {
    marginTop: 14,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 6,
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 10,
  },
  progressPresent: {
    backgroundColor: "#059669",
    borderRadius: 6,
  },
  progressAbsent: {
    backgroundColor: "#e11d48",
    borderRadius: 6,
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  kpiPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  kpiPillPresent: {
    backgroundColor: "#ecfdf5",
  },
  kpiPillAbsent: {
    backgroundColor: "#fff1f2",
  },
  kpiPillNeutral: {
    backgroundColor: "#f1f5f9",
  },
  kpiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kpiText: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "600",
  },
  kpiBold: {
    fontWeight: "800",
  },
  kpiTotalText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 23, 42, 0.06)",
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
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  logFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  logFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  logFilterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  logFilterPillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748b",
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
    color: "#94a3b8",
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  sessionDateCol: {
    flex: 1,
  },
  sessionDate: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  sessionSlot: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 1,
  },
  sessionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sessionBadgePresent: {
    backgroundColor: "#ecfdf5",
  },
  sessionBadgeAbsent: {
    backgroundColor: "#fff1f2",
  },
  sessionBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sessionTextPresent: {
    color: "#059669",
  },
  sessionTextAbsent: {
    color: "#e11d48",
  },
});
