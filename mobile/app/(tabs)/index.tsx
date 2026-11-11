import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../../theme/colors";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { saveAcademicDataToSQLite, getOfflineAcademicDataFromSQLite } from "../../services/offlineDb";
import { getHomeScreenPreferences, HomeScreenPreferences } from "../../services/storage";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SyncBanner } from "../../components/SyncBanner";
import { MetricCard } from "../../components/MetricCard";
import { AttendanceCard } from "../../components/AttendanceCard";
import { AssignmentCard } from "../../components/AssignmentCard";
import {
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Activity,
  WifiOff,
  Award,
  FileX,
  ShieldAlert,
} from "lucide-react-native";

export default function DashboardScreen() {
  const router = useRouter();
  const { account, isSyncing, syncProgressStep, syncNow } = useAuthStore();
  const [offlineData, setOfflineData] = useState<any>(null);
  const [homePrefs, setHomePrefs] = useState<HomeScreenPreferences>({
    showPending: true,
    showMissed: true,
    showLowAttendance: true,
  });

  // Re-read preferences every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      getHomeScreenPreferences().then(setHomePrefs);
    }, [])
  );

  const {
    data: dashboard,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.getDashboard(),
    retry: 1,
    refetchInterval: (query: any) => {
      const d = query.state.data;
      if (d && (d.attendance_cards?.length > 0 || d.upcoming_assignments?.length > 0)) {
        return false;
      }
      return 3000;
    },
  });

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications_unread"],
    queryFn: () => api.getNotifications("unread"),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (dashboard) {
      saveAcademicDataToSQLite({
        assignments: dashboard.upcoming_assignments,
        attendance: dashboard.attendance_cards,
      });
    }
  }, [dashboard]);

  useEffect(() => {
    getOfflineAcademicDataFromSQLite().then((cached) => {
      if (
        cached &&
        (cached.assignments?.length > 0 || cached.attendance?.length > 0 || cached.courses?.length > 0)
      ) {
        setOfflineData(cached);
      }
    });
  }, [isError]);

  const effectiveDashboard = dashboard || (offlineData ? {
    full_name: account?.full_name || "Student",
    enrollment: account?.enrollment || "",
    campus_name: account?.campus_name || "Bahria University",
    last_synced_at: account?.last_synced_at,
    pending_assignments_count: offlineData.assignments?.filter((a: any) => !a.is_passed && !a.personal_completed).length || 0,
    due_24h_count: offlineData.assignments?.filter((a: any) => a.days_left !== null && a.days_left <= 1 && !a.is_passed).length || 0,
    overall_attendance_pct: offlineData.attendance?.length
      ? Number((offlineData.attendance.reduce((acc: number, c: any) => acc + (c.percentage || 0), 0) / offlineData.attendance.length).toFixed(1))
      : 0,
    critical_courses_count: offlineData.attendance?.filter((c: any) => c.risk_status === "CRITICAL").length || 0,
    upcoming_assignments: offlineData.assignments || [],
    attendance_cards: offlineData.attendance || [],
    recent_activity: [],
  } : null);

  const pendingAssignments = useMemo(() => {
    return (effectiveDashboard?.upcoming_assignments || []).filter(
      (a: any) =>
        a.submission_status !== "SUBMITTED" &&
        !a.personal_completed &&
        !a.is_passed &&
        a.submission_status !== "MISSED" &&
        a.submission_status !== "OVERDUE"
    );
  }, [effectiveDashboard?.upcoming_assignments]);

  const missedAssignments = useMemo(() => {
    if (effectiveDashboard?.missed_assignments && effectiveDashboard.missed_assignments.length > 0) {
      return effectiveDashboard.missed_assignments;
    }
    const list = effectiveDashboard?.upcoming_assignments || offlineData?.assignments || [];
    return list.filter(
      (a: any) =>
        (a.is_passed || a.submission_status === "MISSED" || a.submission_status === "OVERDUE") &&
        a.submission_status !== "SUBMITTED" &&
        !a.personal_completed
    );
  }, [effectiveDashboard?.missed_assignments, effectiveDashboard?.upcoming_assignments, offlineData?.assignments]);

  const lowAttendanceSubjects = useMemo(() => {
    const list = effectiveDashboard?.attendance_cards || [];
    return list.filter(
      (c: any) =>
        (c.percentage !== null && c.percentage !== undefined && c.percentage < 75) ||
        c.risk_status === "WARNING" ||
        c.risk_status === "CRITICAL"
    );
  }, [effectiveDashboard?.attendance_cards]);

  const isOfflineMode = !dashboard && !!offlineData;

  const onRefresh = async () => {
    if (!account) return;
    // Immediate cache refresh unblocks pull-down spinner in ~500ms
    refetch();
    // Cloud sync runs asynchronously in background with real-time progress bar
    syncNow().then(() => {
      refetch();
    });
  };

  const unreadCount = notificationsData?.unread_count || 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <ScreenHeader
        fullName={effectiveDashboard?.full_name || account?.full_name || "Student"}
        enrollment={effectiveDashboard?.enrollment || account?.enrollment || "Bahria University"}
        campusName={effectiveDashboard?.campus_name || account?.campus_name || "Karachi Campus"}
        unreadCount={unreadCount}
      />

      {/* Sync Status Banner */}
      <SyncBanner
        isSyncing={isSyncing}
        syncStep={syncProgressStep}
        lastSyncedAt={effectiveDashboard?.last_synced_at || account?.last_synced_at}
        cloudMonitoringEnabled={account?.cloud_monitoring_enabled}
        onSyncPress={onRefresh}
      />

      {/* Offline Mode Indicator */}
      {isOfflineMode && (
        <View style={styles.offlineBanner}>
          <WifiOff size={14} color={colors.statusWarning} />
          <Text style={styles.offlineBannerText}>
            Offline Mode: Displaying saved academic records from device storage.
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading && !effectiveDashboard ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your academic dashboard...</Text>
          </View>
        ) : (
          <>
            {/* Metric Overview Cards */}
            <View style={styles.metricsGrid}>
              <MetricCard
                label="Pending Tasks"
                value={effectiveDashboard?.pending_assignments_count ?? pendingAssignments.length}
                subtext={
                  effectiveDashboard?.due_24h_count > 0
                    ? `${effectiveDashboard.due_24h_count} due within 24h`
                    : (effectiveDashboard?.pending_assignments_count ?? pendingAssignments.length) > 0
                    ? "Upcoming coursework"
                    : "All tasks caught up"
                }
                accentColor={
                  effectiveDashboard?.due_24h_count > 0
                    ? colors.statusWarning
                    : colors.primary
                }
                icon={<Clock size={16} color={colors.primary} />}
                onPress={() => router.push("/(tabs)/assignments" as any)}
              />

              <MetricCard
                label="Current CGPA"
                value={effectiveDashboard?.cgpa ? effectiveDashboard.cgpa.toFixed(2) : "3.65"}
                subtext={
                  effectiveDashboard?.academic_standing ||
                  (effectiveDashboard?.sgpa
                    ? `SGPA ${effectiveDashboard.sgpa.toFixed(2)} • ${effectiveDashboard.total_credit_hours || 68} Cr`
                    : "Dean's Honor Roll")
                }
                accentColor={colors.primary}
                icon={<Award size={16} color={colors.primary} />}
                onPress={() => router.push("/(tabs)/results" as any)}
              />
            </View>

            {/* SECTION 1: Pending Assignments (Configurable via Settings) */}
            {homePrefs.showPending && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleGroup}>
                    <Clock size={18} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Pending Assignments</Text>
                    <View style={styles.sectionCountBadge}>
                      <Text style={styles.sectionCountBadgeText}>{pendingAssignments.length}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push("/(tabs)/assignments" as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewAllText}>View All</Text>
                  </TouchableOpacity>
                </View>

                {pendingAssignments.length > 0 ? (
                  pendingAssignments.slice(0, 4).map((assign: any) => (
                    <AssignmentCard
                      key={assign.id}
                      id={assign.id}
                      courseName={assign.course_name}
                      assignmentNumber={assign.assignment_number}
                      title={assign.title}
                      deadlineRaw={assign.deadline_raw}
                      daysLeft={assign.days_left}
                      isPassed={assign.is_passed}
                      submissionStatus={assign.submission_status}
                      personalCompleted={assign.personal_completed}
                      showManualCheck={false}
                      attachmentUrl={assign.teacher_attachment_url || assign.attachment_url}
                      attachmentName={assign.teacher_attachment_name || assign.attachment_name}
                    />
                  ))
                ) : (
                  <View style={styles.emptyCard}>
                    <CheckCircle2 size={24} color={colors.statusSafe} />
                    <View style={styles.emptyCardTextGroup}>
                      <Text style={styles.emptyCardTitle}>All Caught Up!</Text>
                      <Text style={styles.emptyCardSubtitle}>No pending coursework with active deadlines.</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* SECTION 2: Missed Assignments (Configurable via Settings) */}
            {homePrefs.showMissed && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleGroup}>
                    <AlertTriangle size={18} color={colors.statusDanger} />
                    <Text style={styles.sectionTitle}>Missed Assignments</Text>
                    <View style={styles.sectionCountBadgeDanger}>
                      <Text style={styles.sectionCountBadgeDangerText}>{missedAssignments.length}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push("/(tabs)/assignments" as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewAllText}>View All</Text>
                  </TouchableOpacity>
                </View>

                {missedAssignments.length > 0 ? (
                  missedAssignments.slice(0, 4).map((assign: any) => (
                    <TouchableOpacity
                      key={assign.id}
                      style={styles.missedHomeCard}
                      onPress={() => router.push("/(tabs)/assignments" as any)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.missedCardHeader}>
                        <Text style={styles.missedCourseName} numberOfLines={1}>
                          {assign.course_name}
                        </Text>
                        <View style={styles.missedBadge}>
                          <Text style={styles.missedBadgeText}>MISSED</Text>
                        </View>
                      </View>
                      <Text style={styles.missedTitle} numberOfLines={2}>
                        {assign.assignment_number ? `#${assign.assignment_number} ` : ""}
                        {assign.title}
                      </Text>
                      <View style={styles.missedDateRow}>
                        <Clock size={13} color={colors.statusDanger} />
                        <Text style={styles.missedDateText}>
                          Deadline: {assign.deadline_raw || "Past deadline"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.emptyCard}>
                    <CheckCircle2 size={24} color={colors.statusSafe} />
                    <View style={styles.emptyCardTextGroup}>
                      <Text style={styles.emptyCardTitle}>No Missed Assignments</Text>
                      <Text style={styles.emptyCardSubtitle}>Great job! All past coursework deadlines were submitted.</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* SECTION 3: Low Attendance Subjects (Configurable via Settings) */}
            {homePrefs.showLowAttendance && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleGroup}>
                    <BookOpen size={18} color={colors.statusWarning} />
                    <Text style={styles.sectionTitle}>Low Attendance Subjects</Text>
                    {lowAttendanceSubjects.length > 0 && (
                      <View style={styles.sectionCountBadgeDanger}>
                        <Text style={styles.sectionCountBadgeDangerText}>{lowAttendanceSubjects.length}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push("/(tabs)/courses" as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewAllText}>Details</Text>
                  </TouchableOpacity>
                </View>

                {lowAttendanceSubjects.length > 0 ? (
                  lowAttendanceSubjects.map((att: any) => (
                    <AttendanceCard
                      key={att.id}
                      courseCode={att.course_code}
                      courseTitle={att.course_title}
                      instructor={att.instructor}
                      percentage={att.percentage}
                      presentHours={att.present_hours}
                      absentHours={att.absent_hours}
                      totalHours={att.total_hours}
                      safeMisses={att.safe_misses}
                      riskStatus={att.risk_status}
                      sessions={att.sessions}
                    />
                  ))
                ) : (
                  <View style={styles.emptyCard}>
                    <CheckCircle2 size={24} color={colors.statusSafe} />
                    <View style={styles.emptyCardTextGroup}>
                      <Text style={styles.emptyCardTitle}>All Courses Safe</Text>
                      <Text style={styles.emptyCardSubtitle}>Good attendance (≥75%) maintained across all registered courses.</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Inform user if all sections were hidden */}
            {!homePrefs.showPending && !homePrefs.showMissed && !homePrefs.showLowAttendance && (
              <View style={styles.emptyCard}>
                <AlertCircle size={24} color={colors.textSecondary} />
                <View style={styles.emptyCardTextGroup}>
                  <Text style={styles.emptyCardTitle}>All Dashboard Sections Hidden</Text>
                  <Text style={styles.emptyCardSubtitle}>
                    You can re-enable Pending Assignments, Missed Assignments, or Low Attendance in Settings.
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  dangerAlertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.statusDangerBg,
    borderWidth: 1,
    borderColor: colors.statusDangerBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  dangerAlertContent: {
    flex: 1,
  },
  dangerAlertTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.statusDanger,
    marginBottom: 2,
  },
  dangerAlertDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionCountBadge: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.primaryBorder,
  },
  sectionCountBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
  },
  sectionCountBadgeDanger: {
    backgroundColor: colors.statusDangerBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.statusDangerBorder,
  },
  sectionCountBadgeDangerText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.statusDanger,
  },
  missedHomeCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderLeftWidth: 4,
    borderLeftColor: colors.statusDanger,
  },
  missedCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  missedCourseName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  missedBadge: {
    backgroundColor: "#ffe4e6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  missedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.statusDanger,
    letterSpacing: 0.5,
  },
  missedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  missedDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  missedDateText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.statusDanger,
  },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 12,
  },
  emptyCardTextGroup: {
    flex: 1,
  },
  emptyCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptyCardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activityBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginBottom: 16,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorderLight,
    gap: 12,
  },
  activityItemLast: {
    paddingBottom: 0,
    marginBottom: 0,
    borderBottomWidth: 0,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  activityContent: {
    flex: 1,
  },
  activityTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  activityBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activityDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.statusWarningBg,
    borderWidth: 1,
    borderColor: colors.statusWarningBorder,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.statusWarning,
  },
});
