import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../../theme/colors";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { SyncBanner } from "../../components/SyncBanner";
import { saveAcademicDataToSQLite, getOfflineAcademicDataFromSQLite } from "../../services/offlineDb";
import { getSecureItem, saveSecureItem } from "../../services/storage";
import { notifyAttendanceUpdate } from "../../services/notifications";
import { AttendanceCard } from "../../components/AttendanceCard";
import { useSwipeTabNavigation } from "../../hooks/useSwipeTabNavigation";
import { ShieldAlert, X, WifiOff, Info, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react-native";

export default function CoursesScreen() {
  const swipeHandlers = useSwipeTabNavigation();
  const { account, isSyncing, syncProgressStep, syncNow } = useAuthStore();
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [showPolicyModal, setShowPolicyModal] = useState<boolean>(false);
  const [offlineAttendance, setOfflineAttendance] = useState<any[] | null>(null);

  const {
    data: attendanceList,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["attendance"],
    queryFn: () => api.getAttendance(),
    retry: 1,
    refetchInterval: 10000, // Continuous real-time updates every 10s
  });

  // Re-fetch attendance and trigger background sync if stale when entering tab
  useFocusEffect(
    useCallback(() => {
      refetch();

      const lastSync = account?.last_synced_at;
      const isStale =
        !lastSync ||
        Date.now() - new Date(lastSync.endsWith("Z") ? lastSync : lastSync + "Z").getTime() > 60000;

      if (isStale && !isSyncing) {
        syncNow().catch(() => {});
      }
    }, [refetch, account?.last_synced_at, isSyncing, syncNow])
  );

  // Periodic check while user stays on this screen: sync if data is stale
  useEffect(() => {
    const timer = setInterval(() => {
      const lastSync = account?.last_synced_at;
      const isStale =
        !lastSync ||
        Date.now() - new Date(lastSync.endsWith("Z") ? lastSync : lastSync + "Z").getTime() > 60000;
      if (isStale && !isSyncing) {
        syncNow().catch(() => {});
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [account?.last_synced_at, isSyncing, syncNow]);

  const onRefresh = async () => {
    refetch();
    if (account && !isSyncing) {
      syncNow().then(() => {
        refetch();
      });
    }
  };

  const previousAttendanceRef = React.useRef<Record<string, { present: number; absent: number; pct: number }> | null>(null);

  useEffect(() => {
    if (attendanceList && attendanceList.length > 0) {
      saveAcademicDataToSQLite({ attendance: attendanceList });

      // Detect newly marked attendance changes and fire instant notifications
      (async () => {
        let known = previousAttendanceRef.current;
        if (!known) {
          const stored = await getSecureItem("cf_known_attendance_snapshot");
          if (stored) {
            try {
              known = JSON.parse(stored);
            } catch {}
          }
        }

        // Load historical notified events so we never re-alert for past absences or the same status twice
        let notifiedEvents = new Set<string>();
        try {
          const storedEvents = await getSecureItem("cf_notified_attendance_events");
          if (storedEvents) {
            const arr = JSON.parse(storedEvents);
            if (Array.isArray(arr)) {
              notifiedEvents = new Set(arr);
            }
          }
        } catch {}

        let didNotify = false;

        // Only compare and notify if we already had a valid previous snapshot established
        if (known && Object.keys(known).length > 0) {
          for (const item of attendanceList) {
            const key = item.course_code || item.course_title || item.id;
            const title = item.course_title || item.course_code || "Course";
            const prev = known[key];

            if (prev) {
              if (item.absent_hours > prev.absent) {
                const eventKey = `${key}_absent_${item.absent_hours}`;
                if (!notifiedEvents.has(eventKey)) {
                  notifiedEvents.add(eventKey);
                  didNotify = true;
                  notifyAttendanceUpdate({
                    courseTitle: title,
                    status: "ABSENT",
                    percentage: item.percentage,
                    presentHours: item.present_hours,
                    totalHours: item.total_hours,
                  });
                  break;
                }
              } else if (item.present_hours > prev.present) {
                const eventKey = `${key}_present_${item.present_hours}`;
                if (!notifiedEvents.has(eventKey)) {
                  notifiedEvents.add(eventKey);
                  didNotify = true;
                  notifyAttendanceUpdate({
                    courseTitle: title,
                    status: "PRESENT",
                    percentage: item.percentage,
                    presentHours: item.present_hours,
                    totalHours: item.total_hours,
                  });
                  break;
                }
              } else if (item.percentage < 75.0 && prev.pct >= 75.0) {
                const eventKey = `${key}_warning_${Math.floor(item.percentage)}`;
                if (!notifiedEvents.has(eventKey)) {
                  notifiedEvents.add(eventKey);
                  didNotify = true;
                  notifyAttendanceUpdate({
                    courseTitle: title,
                    status: "WARNING",
                    percentage: item.percentage,
                  });
                  break;
                }
              }
            }
          }
        }

        if (didNotify) {
          saveSecureItem("cf_notified_attendance_events", JSON.stringify(Array.from(notifiedEvents))).catch(() => {});
        }

        const newSnapshot: Record<string, { present: number; absent: number; pct: number }> = {};
        for (const item of attendanceList) {
          const key = item.course_code || item.course_title || item.id;
          newSnapshot[key] = {
            present: item.present_hours,
            absent: item.absent_hours,
            pct: item.percentage,
          };
        }
        previousAttendanceRef.current = newSnapshot;
        saveSecureItem("cf_known_attendance_snapshot", JSON.stringify(newSnapshot)).catch(() => {});
      })();
    }
  }, [attendanceList]);

  useEffect(() => {
    getOfflineAcademicDataFromSQLite().then((cached) => {
      if (cached && cached.attendance && cached.attendance.length > 0) {
        setOfflineAttendance(cached.attendance);
      }
    });
  }, [isError]);

  const effectiveList = attendanceList || offlineAttendance || [];
  const isOffline = !attendanceList && !!offlineAttendance;

  const filtered = effectiveList.filter((item: any) => {
    if (filterStatus === "SAFE") return item.risk_status === "SAFE";
    if (filterStatus === "WARNING") return item.risk_status === "WARNING";
    if (filterStatus === "CRITICAL") return item.risk_status === "CRITICAL";
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]} {...swipeHandlers}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Attendance Tracker</Text>
          <Text style={styles.screenSubtitle}>
            {effectiveList.length > 0
              ? `${effectiveList.length} registered courses • Class-by-class history`
              : "Coursework attendance monitoring"}
          </Text>
        </View>

        {/* Official Policy Button */}
        <TouchableOpacity
          style={styles.policyButton}
          onPress={() => setShowPolicyModal(true)}
          activeOpacity={0.8}
        >
          <Info size={14} color={colors.primary} />
          <Text style={styles.policyButtonText}>Policy</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Status Banner */}
      <SyncBanner
        isSyncing={isSyncing}
        syncStep={syncProgressStep}
        lastSyncedAt={account?.last_synced_at}
        cloudMonitoringEnabled={account?.cloud_monitoring_enabled}
        onSyncPress={onRefresh}
      />

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(["ALL", "SAFE", "WARNING", "CRITICAL"] as const).map((status) => {
          const isActive = filterStatus === status;
          return (
            <TouchableOpacity
              key={status}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setFilterStatus(status)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterPillText,
                  isActive && styles.filterPillTextActive,
                ]}
              >
                {status === "ALL"
                  ? "All Courses"
                  : status === "SAFE"
                  ? "Safe Zone"
                  : status === "WARNING"
                  ? "Warning"
                  : "Critical"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Offline Mode Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <WifiOff size={14} color={colors.statusWarning} />
          <Text style={styles.offlineBannerText}>
            Offline Mode: Displaying saved attendance records from device storage.
          </Text>
        </View>
      )}

      {/* Main List */}
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
        {isLoading && effectiveList.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading attendance data from portal...</Text>
          </View>
        ) : filtered.length > 0 ? (
          filtered.map((att: any) => (
            <AttendanceCard
              key={att.id}
              courseCode={att.course_code}
              courseTitle={att.course_title}
              instructor={att.instructor}
              creditHours={att.credit_hours || 3}
              totalSemesterHours={att.total_semester_hours || 48}
              percentage={att.percentage}
              presentHours={att.present_hours}
              absentHours={att.absent_hours}
              totalHours={att.total_hours}
              safeMisses={att.safe_misses}
              fineSkips={att.fine_skips || 7}
              fineAmount={att.fine_amount || 0}
              riskStatus={att.risk_status}
              sessions={att.sessions}
            />
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No courses match the selected filter.</Text>
          </View>
        )}
      </ScrollView>

      {/* Official Bahria Attendance Policy Modal */}
      <Modal
        visible={showPolicyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPolicyModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPolicyModal(false)}
        >
          <View style={styles.modalContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleGroup}>
                <ShieldCheck size={20} color={colors.primary} />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={styles.modalTitle}>Official Attendance Policy</Text>
                  <Text style={styles.modalSubtitle}>Bahria University Academic Regulations</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowPolicyModal(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.policyTiers}>
              {/* Tier 1: 80% to 100% */}
              <View style={[styles.tierCard, { borderLeftColor: colors.statusSafe }]}>
                <View style={styles.tierHeader}>
                  <View style={[styles.tierBadge, { backgroundColor: "#ecfdf5" }]}>
                    <Text style={[styles.tierBadgeText, { color: colors.statusSafe }]}>80% - 100%</Text>
                  </View>
                  <Text style={[styles.tierTitle, { color: colors.statusSafe }]}>Optimal Safe Attendance</Text>
                </View>
                <Text style={styles.tierDescription}>
                  Allowed to appear in all Mid-Term and Final Examinations without condition. Eligible for Merit Scholarships and Academic Honors.
                </Text>
              </View>

              {/* Tier 2: 75% to 79% */}
              <View style={[styles.tierCard, { borderLeftColor: "#2563eb" }]}>
                <View style={styles.tierHeader}>
                  <View style={[styles.tierBadge, { backgroundColor: "#eff6ff" }]}>
                    <Text style={[styles.tierBadgeText, { color: "#2563eb" }]}>75% - 79%</Text>
                  </View>
                  <Text style={[styles.tierTitle, { color: "#2563eb" }]}>Permissible Attendance</Text>
                </View>
                <Text style={styles.tierDescription}>
                  Permitted to appear in exams as 75% is the official university baseline. Student does not face debarment or penalty.
                </Text>
              </View>

              {/* Tier 3: 60% to 74% */}
              <View style={[styles.tierCard, { borderLeftColor: colors.statusWarning }]}>
                <View style={styles.tierHeader}>
                  <View style={[styles.tierBadge, { backgroundColor: "#fffbeb" }]}>
                    <Text style={[styles.tierBadgeText, { color: colors.statusWarning }]}>60% - 74%</Text>
                  </View>
                  <Text style={[styles.tierTitle, { color: colors.statusWarning }]}>Condonation With Fine</Text>
                </View>
                <Text style={styles.tierDescription}>
                  Allowed to sit in examinations subject to payment of fine (Rs. 500 per subject for general courses, up to Rs. 2,000 max). Head of Department approval required.
                </Text>
              </View>

              {/* Tier 4: Below 60% */}
              <View style={[styles.tierCard, { borderLeftColor: colors.statusDanger }]}>
                <View style={styles.tierHeader}>
                  <View style={[styles.tierBadge, { backgroundColor: "#fef2f2" }]}>
                    <Text style={[styles.tierBadgeText, { color: colors.statusDanger }]}>Below 60%</Text>
                  </View>
                  <Text style={[styles.tierTitle, { color: colors.statusDanger }]}>Strictly Debarred</Text>
                </View>
                <Text style={styles.tierDescription}>
                  Strictly debarred from sitting in the Final Examination. An 'F' grade is awarded in the course, and the student must repeat the course.
                </Text>
              </View>

              {/* Total Hours Reference */}
              <View style={styles.policyNoteBox}>
                <Info size={16} color={colors.primary} />
                <Text style={styles.policyNoteText}>
                  Standard 3-Credit & Lab courses have 48 contact hours per semester (max safe skips = 12 hrs to stay at 75%). 2-Credit courses have 32 hours (max safe skips = 8 hrs).
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowPolicyModal(false)}
            >
              <Text style={styles.closeBtnText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: colors.surface,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: "500",
  },
  policyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  policyButtonText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
  },
  filterPillActive: {
    backgroundColor: colors.primaryDark,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: "#ffffff",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.statusWarningBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  offlineBannerText: {
    fontSize: 11,
    color: colors.statusWarning,
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 48,
  },
  centerLoading: {
    padding: 60,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyBox: {
    padding: 32,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  policyTiers: {
    gap: 8,
    marginBottom: 14,
  },
  tierCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  tierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  tierTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  tierDescription: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  policyNoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.primarySubtle,
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  policyNoteText: {
    fontSize: 11,
    color: colors.primary,
    flex: 1,
    lineHeight: 15,
  },
  closeBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
