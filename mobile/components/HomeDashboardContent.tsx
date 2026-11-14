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
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { saveAcademicDataToSQLite, getOfflineAcademicDataFromSQLite } from "../services/offlineDb";
import { getHomeScreenPreferences, HomeScreenPreferences } from "../services/storage";
import { ScreenHeader } from "./ScreenHeader";
import { SyncBanner } from "./SyncBanner";
import { MetricCard } from "./MetricCard";
import { AttendanceCard } from "./AttendanceCard";
import { AssignmentCard } from "./AssignmentCard";
import { AssignmentAlarmModal } from "./AssignmentAlarmModal";
import { CommunityServicesModal } from "./CommunityServicesModal";
import { useAlarmStore } from "../stores/alarmStore";
import { useTabStore } from "../stores/tabStore";
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
  HeartHandshake,
} from "lucide-react-native";

export const HomeDashboardContent: React.FC = () => {
  const router = useRouter();
  const { account, isSyncing, syncProgressStep, syncNow } = useAuthStore();
  const { alarms } = useAlarmStore();
  const { scrollToTab } = useTabStore();
  const [offlineData, setOfflineData] = useState<any>(null);
  const [alarmTargetAssignment, setAlarmTargetAssignment] = useState<any | null>(null);
  const [showAlarmModal, setShowAlarmModal] = useState<boolean>(false);
  const [showCspModal, setShowCspModal] = useState<boolean>(false);
  const [homePrefs, setHomePrefs] = useState<HomeScreenPreferences>({
    showPending: true,
    showMissed: true,
    showLowAttendance: true,
  });

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
    refetchInterval: 8000,
  });

  useFocusEffect(
    useCallback(() => {
      getHomeScreenPreferences().then(setHomePrefs);
      refetch();
    }, [refetch])
  );

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
    total_csp_hours: offlineData.total_csp_hours ?? 0.0,
    csp_required_hours: 40.0,
    community_services: offlineData.community_services || [],
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
    refetch();
  };

  const handleManualSync = async () => {
    if (!account || isSyncing) return;
    try {
      await syncNow();
      refetch();
    } catch {}
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
        onSyncPress={handleManualSync}
      />

      {/* Offline Mode Banner */}
      {isOfflineMode && (
        <View style={styles.offlineBanner}>
          <WifiOff size={16} color="#b45309" />
          <Text style={styles.offlineBannerText}>
            Showing cached data from local device storage (Offline Mode).
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading student profile...</Text>
          </View>
        ) : (
          <>
            {/* Quick Metrics Grid */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricCol}>
                <MetricCard
                  label="CSP Hours"
                  value={
                    effectiveDashboard?.total_csp_hours !== undefined
                      ? `${effectiveDashboard.total_csp_hours} hrs`
                      : "--"
                  }
                  subtext={
                    effectiveDashboard?.total_csp_hours !== undefined
                      ? `${effectiveDashboard.total_csp_hours} of ${effectiveDashboard.csp_required_hours || 40} required`
                      : "Community Service"
                  }
                  accentColor={
                    (effectiveDashboard?.total_csp_hours || 0) >=
                    (effectiveDashboard?.csp_required_hours || 40)
                      ? colors.statusSafe
                      : colors.primary
                  }
                  icon={<HeartHandshake size={18} color={colors.primary} />}
                  onPress={() => setShowCspModal(true)}
                />
              </View>
              <View style={styles.metricCol}>
                <MetricCard
                  label="Pending Tasks"
                  value={String(effectiveDashboard?.pending_assignments_count ?? "--")}
                  subtext={
                    (effectiveDashboard?.due_24h_count || 0) > 0
                      ? `${effectiveDashboard?.due_24h_count} due within 24h`
                      : "No immediate dues"
                  }
                  accentColor={
                    (effectiveDashboard?.due_24h_count || 0) > 0
                      ? colors.statusDanger
                      : colors.primary
                  }
                  icon={<Clock size={18} color={colors.primary} />}
                  onPress={() => scrollToTab(2)}
                />
              </View>
            </View>

            {/* Quick Navigation Cards */}
            <View style={styles.quickNavRow}>
              <TouchableOpacity
                style={styles.quickNavCard}
                onPress={() => scrollToTab(1)}
                activeOpacity={0.7}
              >
                <Activity size={20} color={colors.primary} />
                <Text style={styles.quickNavTitle}>Attendance</Text>
                <Text style={styles.quickNavSub}>View safe skips & lectures</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickNavCard}
                onPress={() => scrollToTab(2)}
                activeOpacity={0.7}
              >
                <Calendar size={20} color={colors.primary} />
                <Text style={styles.quickNavTitle}>Assignments</Text>
                <Text style={styles.quickNavSub}>Deadlines & submissions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickNavCard}
                onPress={() => scrollToTab(3)}
                activeOpacity={0.7}
              >
                <BookOpen size={20} color={colors.primary} />
                <Text style={styles.quickNavTitle}>Lectures</Text>
                <Text style={styles.quickNavSub}>Notes & ZIP export</Text>
              </TouchableOpacity>
            </View>

            {/* SECTION 1: Pending & Upcoming Coursework */}
            {homePrefs.showPending && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleGroup}>
                    <Clock size={18} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Pending Coursework</Text>
                    {pendingAssignments.length > 0 && (
                      <View style={styles.sectionCountBadge}>
                        <Text style={styles.sectionCountBadgeText}>{pendingAssignments.length}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => scrollToTab(2)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewAllText}>View All</Text>
                  </TouchableOpacity>
                </View>

                {pendingAssignments.length > 0 ? (
                  pendingAssignments.map((assign: any) => (
                    <AssignmentCard
                      key={assign.id}
                      id={assign.id}
                      title={assign.title}
                      assignmentNumber={assign.assignment_number || "1"}
                      courseName={assign.course_name}
                      deadlineRaw={assign.deadline_raw}
                      daysLeft={assign.days_left}
                      submissionStatus={assign.submission_status || "PENDING"}
                      isPassed={assign.is_passed || false}
                      personalCompleted={assign.personal_completed || false}
                      alarmScheduledTime={alarms[assign.id]?.triggerTimestamp}
                      isAlarmSnoozed={alarms[assign.id]?.isSnoozed}
                      onSetAlarm={() => {
                        setAlarmTargetAssignment(assign);
                        setShowAlarmModal(true);
                      }}
                      onPress={() => scrollToTab(2)}
                    />
                  ))
                ) : (
                  <View style={styles.emptyCard}>
                    <CheckCircle2 size={24} color={colors.statusSafe} />
                    <View style={styles.emptyCardTextGroup}>
                      <Text style={styles.emptyCardTitle}>No Pending Assignments</Text>
                      <Text style={styles.emptyCardSubtitle}>You're all caught up with your university coursework!</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* SECTION 2: Missed Deadlines */}
            {homePrefs.showMissed && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleGroup}>
                    <FileX size={18} color={colors.statusDanger} />
                    <Text style={styles.sectionTitle}>Missed Assignments</Text>
                    {missedAssignments.length > 0 && (
                      <View style={styles.sectionCountBadgeDanger}>
                        <Text style={styles.sectionCountBadgeDangerText}>{missedAssignments.length}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => scrollToTab(2)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewAllText}>Review</Text>
                  </TouchableOpacity>
                </View>

                {missedAssignments.length > 0 ? (
                  missedAssignments.map((assign: any) => (
                    <TouchableOpacity
                      key={assign.id || assign.title}
                      style={styles.missedCard}
                      onPress={() => scrollToTab(2)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.missedCardHeader}>
                        <Text style={styles.missedCardCourse} numberOfLines={1}>
                          {assign.course_name}
                        </Text>
                        <View style={styles.missedPill}>
                          <Text style={styles.missedPillText}>CLOSED</Text>
                        </View>
                      </View>
                      <Text style={styles.missedCardTitle} numberOfLines={2}>
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

            {/* SECTION 3: Low Attendance Subjects */}
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
                    onPress={() => scrollToTab(1)}
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
          </>
        )}
      </ScrollView>

      {/* Assignment Alarm & Reminder Modal */}
      <AssignmentAlarmModal
        visible={showAlarmModal}
        assignment={alarmTargetAssignment}
        onClose={() => {
          setShowAlarmModal(false);
          setAlarmTargetAssignment(null);
        }}
      />

      {/* Community Services (CSP) Modal */}
      <CommunityServicesModal
        visible={showCspModal}
        onClose={() => setShowCspModal(false)}
        totalHours={effectiveDashboard?.total_csp_hours ?? 0}
        requiredHours={effectiveDashboard?.csp_required_hours ?? 40}
        records={effectiveDashboard?.community_services || []}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  metricCol: {
    flex: 1,
  },
  quickNavRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  quickNavCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorderSubtle,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  quickNavTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 8,
  },
  quickNavSub: {
    fontSize: 10.5,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  sectionBlock: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  sectionCountBadge: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
  },
  sectionCountBadgeDanger: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountBadgeDangerText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#dc2626",
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  emptyCardTextGroup: {
    flex: 1,
  },
  emptyCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptyCardSubtitle: {
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  missedCard: {
    backgroundColor: "#fff5f5",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
    marginBottom: 10,
  },
  missedCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  missedCardCourse: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#991b1b",
    flex: 1,
  },
  missedPill: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  missedPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  missedCardTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 18,
  },
  missedDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  missedDateText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#dc2626",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#fde68a",
  },
  offlineBannerText: {
    fontSize: 11.5,
    color: "#92400e",
    fontWeight: "600",
    flex: 1,
  },
});
