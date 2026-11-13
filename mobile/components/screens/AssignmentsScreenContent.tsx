import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { colors } from "../../theme/colors";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { useAlarmStore } from "../../stores/alarmStore";
import { SyncBanner } from "../SyncBanner";
import { AssignmentAlarmModal } from "../AssignmentAlarmModal";
import { showDownloadSuccessToast } from "../../stores/downloadToastStore";
import { saveAcademicDataToSQLite, getOfflineAcademicDataFromSQLite } from "../../services/offlineDb";
import { getDownloadDirectory, getSecureItem, saveSecureItem, KEYS } from "../../services/storage";
import {
  updateDownloadProgressNotification,
  showDownloadCompleteNotification,
  dismissDownloadNotification,
  ensureNotificationPermissions,
  notifyNewAssignment,
} from "../../services/notifications";
import {
  registerDownloadedFile,
  openDownloadedFile,
  getMimeType,
} from "../../services/downloadsRegistry";
import {
  BookOpen,
  ChevronDown,
  X,
  Check,
  Clock,
  Download,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  FileCheck,
  Lock,
  UploadCloud,
  Trash2,
  Calendar,
  AlarmClock,
  Bell,
} from "lucide-react-native";

export const AssignmentsScreenContent: React.FC = () => {
  const { account, isSyncing, syncProgressStep, syncNow } = useAuthStore();
  const { alarms } = useAlarmStore();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [showCourseModal, setShowCourseModal] = useState<boolean>(false);
  const [offlineAssignments, setOfflineAssignments] = useState<any[] | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [alarmTargetAssignment, setAlarmTargetAssignment] = useState<any | null>(null);
  const [showAlarmModal, setShowAlarmModal] = useState<boolean>(false);

  // Fetch registered courses from LMS
  const {
    data: courses,
    isLoading: isCoursesLoading,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.getCourses(),
    refetchInterval: 15000,
  });

  // Fetch all assignments from LMS
  const {
    data: assignments,
    isLoading: isAssignmentsLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => api.getAssignments(),
    retry: 1,
    refetchInterval: 8000, // Continuous real-time updates every 8s while screen is open
  });

  // Auto-refresh courses and assignments when user navigates to the tab
  useFocusEffect(
    useCallback(() => {
      refetchCourses();
      refetch();
    }, [refetchCourses, refetch])
  );

  const onRefresh = async () => {
    refetchCourses();
    refetch();
  };

  const handleManualSync = async () => {
    if (!account || isSyncing) return;
    try {
      await syncNow();
      refetchCourses();
      refetch();
    } catch {}
  };

  const previousAssignmentIdsRef = React.useRef<Set<string> | null>(null);

  useEffect(() => {
    if (assignments && assignments.length > 0) {
      saveAcademicDataToSQLite({ assignments });

      // Detect newly uploaded assignments and trigger local notification
      (async () => {
        let knownIds = previousAssignmentIdsRef.current;
        if (!knownIds) {
          const stored = await getSecureItem("cf_known_assignment_ids");
          if (stored) {
            try {
              knownIds = new Set(JSON.parse(stored));
            } catch {}
          }
        }

        if (knownIds && knownIds.size > 0) {
          for (const a of assignments) {
            if (!knownIds.has(a.id) && !knownIds.has(a.fingerprint)) {
              notifyNewAssignment({
                title: a.title,
                courseName: a.course_name || "Coursework",
                deadline: a.deadline_raw,
              });
              break;
            }
          }
        }

        const allIds = assignments.map((a: any) => a.id);
        previousAssignmentIdsRef.current = new Set(allIds);
        saveSecureItem("cf_known_assignment_ids", JSON.stringify(allIds)).catch(() => {});
      })();
    }
  }, [assignments]);

  useEffect(() => {
    getOfflineAcademicDataFromSQLite().then((cached) => {
      if (cached && cached.assignments && cached.assignments.length > 0) {
        setOfflineAssignments(cached.assignments);
      }
    });
  }, [isError]);

  const rawList: any[] = assignments || offlineAssignments || [];
  const isOffline = !assignments && !!offlineAssignments;

  // Deduplicate courses by normalized title (preferring clean university course codes)
  const cleanCourses = useMemo(() => {
    if (!courses || courses.length === 0) return [];
    const map = new Map<string, any>();
    for (const c of courses) {
      const norm = (c.title || c.name || "").trim().toLowerCase();
      if (!norm) continue;
      const existing = map.get(norm);
      if (!existing) {
        map.set(norm, c);
      } else {
        const isExistingReal = /^[A-Za-z]{2,4}\s*\d{2,4}/.test(existing.code || "");
        const isNewReal = /^[A-Za-z]{2,4}\s*\d{2,4}/.test(c.code || "");
        if (isNewReal && !isExistingReal) {
          map.set(norm, c);
        }
      }
    }
    return Array.from(map.values());
  }, [courses]);

  // Keep selected course synchronized to a valid deduped course
  useEffect(() => {
    if (cleanCourses && cleanCourses.length > 0) {
      const exists = cleanCourses.some((c: any) => c.id === selectedCourseId);
      if (!selectedCourseId || !exists) {
        setSelectedCourseId(cleanCourses[0].id);
      }
    }
  }, [cleanCourses, selectedCourseId]);

  // Selected course object
  const selectedCourse = useMemo(() => {
    if (!selectedCourseId || !cleanCourses) return null;
    return cleanCourses.find((c: any) => c.id === selectedCourseId || c.title === selectedCourseId);
  }, [selectedCourseId, cleanCourses]);

  // Filter and SEQUENTIALLY sort assignments for selected course
  const courseAssignments = useMemo(() => {
    if (!selectedCourseId || !selectedCourse) return [];
    const list = rawList.filter((a: any) => {
      if (a.course_id && a.course_id === selectedCourse.id) return true;
      const cTitle = (selectedCourse.title || "").trim().toLowerCase();
      const aName = (a.course_name || "").trim().toLowerCase();
      if (!aName || !cTitle) return false;
      if (aName === cTitle) return true;
      const isALab = aName.includes("lab");
      const isCLab = cTitle.includes("lab");
      if (isALab !== isCLab) return false;
      return aName.includes(cTitle) || cTitle.includes(aName);
    });

    const parseNum = (item: any) => {
      const num = parseInt(item.assignment_number ?? "", 10);
      if (!isNaN(num)) return num;
      const match = (item.title || "").match(/\d+/);
      if (match) return parseInt(match[0], 10);
      return 999;
    };

    // Strict sequential ordering: 1, 2, 3, 4, 5...
    return list.slice().sort((a: any, b: any) => {
      const nA = parseNum(a);
      const nB = parseNum(b);
      if (nA !== nB) return nA - nB;
      const dA = a.deadline ? new Date(a.deadline).getTime() : 0;
      const dB = b.deadline ? new Date(b.deadline).getTime() : 0;
      return dA - dB;
    });
  }, [rawList, selectedCourseId, selectedCourse]);

  // Handle downloading teacher's assignment or student's submission from authentic LMS
  const handleDownload = async (
    url: string,
    fallbackFileName: string,
    assignId: string,
    targetType: "teacher" | "submission"
  ) => {
    if (!url && !assignId) {
      Alert.alert("No File", "No document file was found for this assignment.");
      return;
    }

    const downloadKey = `${assignId}_${targetType}`;
    setDownloadingKey(downloadKey);

    try {
      await ensureNotificationPermissions();
      const filenameMatch = (url || "").match(/[?&]file=([^&]+)/) || (url || "").match(/\/([^\/?#]+)$/);
      let name = fallbackFileName;
      if (!name || name === "download") {
        name = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `file_${Date.now()}.pdf`;
      }

      await updateDownloadProgressNotification({
        title: "Downloading File",
        filename: name,
        percent: 10,
      });

      const baseDir = await getDownloadDirectory();
      try {
        if (Platform.OS !== "web") {
          await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
        }
      } catch {}
      const localUri = `${baseDir}${name}`;

      // Build authenticated proxy URL through LMS ∞ backend
      const downloadUrl = await api.getFileDownloadUrl({
        assignmentId: assignId,
        targetType,
        url,
        filename: name,
      });

      const token = await getSecureItem(KEYS.ACCESS_TOKEN);
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await FileSystem.downloadAsync(downloadUrl, localUri, { headers });

      setDownloadingKey(null);

      if (res && res.status === 200) {
        // Validate downloaded file integrity (ensure server did not return HTML error page)
        let isCorrupted = false;
        try {
          const headerSnippet = await FileSystem.readAsStringAsync(res.uri, {
            length: 120,
            encoding: FileSystem.EncodingType.UTF8,
          });
          if (
            headerSnippet.includes("<!DOCTYPE") ||
            headerSnippet.includes("<html") ||
            headerSnippet.includes("aspireRootPath") ||
            headerSnippet.includes("CMS - Bahria") ||
            headerSnippet.includes('{"detail"')
          ) {
            isCorrupted = true;
          }
        } catch {}

        if (isCorrupted) {
          await FileSystem.deleteAsync(res.uri, { idempotent: true });
          await dismissDownloadNotification();
          Alert.alert(
            "Download Incomplete",
            "The university portal returned an expired session or unauthorized page instead of the document. Please pull down to refresh and try downloading again."
          );
          return;
        }

        const fileInfo = await FileSystem.getInfoAsync(res.uri);
        const fileSize = fileInfo.exists && "size" in fileInfo ? fileInfo.size : undefined;

        await registerDownloadedFile({
          fileName: name,
          fileUri: res.uri,
          mimeType: getMimeType(name),
          fileSize: fileSize,
          category: targetType === "submission" ? "submission" : "assignment",
          courseName: selectedCourse?.title,
        });

        await showDownloadCompleteNotification({
          title: "Download Complete! ✅",
          message: `${name} saved to downloads.`,
        });

        // Modern, non-blocking in-app download success toast
        showDownloadSuccessToast({
          fileName: name,
          fileUri: res.uri,
          mimeType: getMimeType(name),
          fileSize: fileSize,
          category: targetType === "submission" ? "submission" : "assignment",
          courseName: selectedCourse?.title,
        });
      } else {
        try {
          await FileSystem.deleteAsync(localUri, { idempotent: true });
        } catch {}
        await dismissDownloadNotification();
        Alert.alert("Download Error", "Could not fetch document from Bahria University LMS.");
      }
    } catch (e: any) {
      setDownloadingKey(null);
      await dismissDownloadNotification();
      Alert.alert("Download Failed", e.message || "An error occurred fetching file from portal.");
    }
  };

  // Submit or Re-upload solution file to Bahria University LMS
  const handlePickAndSubmit = async (assign: any) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/zip",
          "application/x-zip-compressed",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const file = res.assets[0];
      setSubmittingId(assign.id);

      await api.submitAssignment(
        assign.id,
        file.uri,
        file.name,
        file.mimeType || "application/octet-stream"
      );

      Alert.alert(
        "Submitted Successfully! 🎉",
        `"${file.name}" has been uploaded to Bahria University LMS.`
      );
      refetch();
    } catch (err: any) {
      Alert.alert("Submission Error", err.message || "Could not upload assignment to LMS.");
    } finally {
      setSubmittingId(null);
    }
  };

  // Delete student's submission from Bahria University LMS (only if deadline has not passed)
  const handleDeleteSubmission = (assign: any) => {
    Alert.alert(
      "Delete Submission?",
      `Are you sure you want to remove your submission "${assign.submission_attachment_name || "file"}" from Bahria University LMS?\n\nYou can re-upload before the deadline closes.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Submission",
          style: "destructive",
          onPress: async () => {
            setDeletingId(assign.id);
            try {
              await api.deleteAssignmentSubmission(assign.id);
              Alert.alert(
                "Submission Deleted",
                "Your submission has been removed from Bahria University LMS."
              );
              refetch();
            } catch (err: any) {
              Alert.alert(
                "Cannot Delete Submission",
                err.message || "Failed to remove submission from LMS."
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Coursework & Assignments</Text>
        <Text style={styles.screenSubtitle}>
          Official Bahria University briefs and student submissions
        </Text>
      </View>

      {/* Sync Status Banner */}
      <SyncBanner
        isSyncing={isSyncing}
        syncStep={syncProgressStep}
        lastSyncedAt={account?.last_synced_at}
        cloudMonitoringEnabled={account?.cloud_monitoring_enabled}
        onSyncPress={handleManualSync}
      />

      {/* Modern Course Selector Bar */}
      <View style={styles.courseSelectContainer}>
        <TouchableOpacity
          style={styles.courseDropdownButton}
          onPress={() => setShowCourseModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.courseDropdownLeft}>
            <View style={styles.courseIconBox}>
              <BookOpen size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.courseSelectMicroLabel}>ACTIVE COURSE</Text>
              <Text style={styles.courseDropdownTitle} numberOfLines={1}>
                {selectedCourse ? `${selectedCourse.code ? selectedCourse.code + " • " : ""}${selectedCourse.title}` : "Select a Course"}
              </Text>
            </View>
          </View>
          <ChevronDown size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Course Selection Modal */}
      <Modal
        visible={showCourseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCourseModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCourseModal(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <BookOpen size={18} color={colors.primary} />
                <Text style={styles.modalTitle}>Select Course</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCourseModal(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalList}>
              {cleanCourses.map((c: any) => {
                const isSelected = c.id === selectedCourseId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                    onPress={() => {
                      setSelectedCourseId(c.id);
                      setShowCourseModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.modalItemTitle,
                          isSelected && styles.modalItemTextActive,
                        ]}
                      >
                        {c.title}
                      </Text>
                      {c.code ? (
                        <Text style={styles.modalItemSubtitle}>{c.code}</Text>
                      ) : null}
                    </View>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Offline Mode Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <WifiOff size={14} color={colors.statusWarning} />
          <Text style={styles.offlineBannerText}>
            Offline Mode: Displaying saved assignments from device storage.
          </Text>
        </View>
      )}

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || isCoursesLoading}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isAssignmentsLoading && rawList.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading coursework from Bahria LMS...</Text>
          </View>
        ) : cleanCourses.length === 0 ? (
          <View style={styles.noCourseContainer}>
            <View style={styles.noCourseIconCircle}>
              <BookOpen size={36} color={colors.primary} />
            </View>
            <Text style={styles.noCourseTitle}>No Registered Courses Found</Text>
            <Text style={styles.noCourseSubtitle}>
              Syncing registered courses from Bahria LMS. Tap below to reload.
            </Text>
            <TouchableOpacity
              style={{
                marginTop: 16,
                backgroundColor: colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 10,
              }}
              onPress={() => {
                refetchCourses();
                refetch();
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Reload Courses</Text>
            </TouchableOpacity>
          </View>
        ) : !selectedCourseId ? (
          <View style={styles.noCourseContainer}>
            <View style={styles.noCourseIconCircle}>
              <BookOpen size={36} color={colors.primary} />
            </View>
            <Text style={styles.noCourseTitle}>Choose a Course</Text>
            <Text style={styles.noCourseSubtitle}>
              Select a course to view assignment briefs and submissions.
            </Text>
          </View>
        ) : (
          <View style={styles.assignmentsContainer}>
            {/* Header info */}
            <View style={styles.courseMetaRow}>
              <Text style={styles.courseMetaText}>
                {courseAssignments.length} Assignment{courseAssignments.length === 1 ? "" : "s"} Found
              </Text>
              <Text style={styles.courseMetaSub}>Sequential Order</Text>
            </View>

            {courseAssignments.length === 0 ? (
              <View style={styles.emptyCourseState}>
                <CheckCircle2 size={32} color={colors.statusSafe} />
                <Text style={styles.emptyCourseTitle}>No Coursework Available</Text>
                <Text style={styles.emptyCourseSubtitle}>
                  No active assignments currently uploaded for {selectedCourse?.title}.
                </Text>
              </View>
            ) : (
              courseAssignments.map((assign: any, idx: number) => {
                const isSubmitted =
                  assign.submission_status === "SUBMITTED" ||
                  Boolean(assign.submission_attachment_url);

                // Precise deadline calculation
                const nowMs = Date.now();
                const effectiveDeadlineMs = assign.is_extended && assign.extended_deadline
                  ? new Date(assign.extended_deadline).getTime()
                  : assign.deadline
                  ? new Date(assign.deadline).getTime()
                  : null;

                const isTimePassed = effectiveDeadlineMs ? effectiveDeadlineMs < nowMs : false;
                const isDeadlineExceeded = Boolean(
                  assign.is_passed ||
                  isTimePassed ||
                  assign.action === "Deadline Exceeded" ||
                  assign.submission_status === "OVERDUE" ||
                  assign.submission_status === "MISSED"
                );

                const isMissed = isDeadlineExceeded && !isSubmitted;

                const hasTeacherFile = Boolean(
                  assign.teacher_attachment_url || assign.attachment_url
                );
                const hasSubmissionFile = Boolean(assign.submission_attachment_url);

                const isDownloadingTeacher = downloadingKey === `${assign.id}_teacher`;
                const isDownloadingSubmission = downloadingKey === `${assign.id}_submission`;

                // Display index
                const displayIndex = assign.assignment_number
                  ? `#${assign.assignment_number}`
                  : `#${idx + 1}`;

                const cardAccentStyle = isSubmitted
                  ? styles.cardAccentSubmitted
                  : isMissed
                  ? styles.cardAccentMissed
                  : styles.cardAccentPending;

                return (
                  <View key={assign.id} style={[styles.assignmentCard, cardAccentStyle]}>
                    {/* Top Row: Sequential Number + Title + Status Badges */}
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <View style={styles.indexBadge}>
                          <Text style={styles.indexBadgeText}>{displayIndex}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.assignmentTitle} numberOfLines={2}>
                            {assign.title}
                          </Text>

                          {/* Clean single-line Due Date */}
                          <View style={styles.dateRow}>
                            <Clock
                              size={12}
                              color={isMissed ? colors.statusDanger : colors.textMuted}
                            />
                            <Text
                              style={[
                                styles.dateText,
                                isMissed && { color: colors.statusDanger, fontWeight: "600" },
                              ]}
                            >
                              {assign.is_extended
                                ? `Extended Due: ${assign.extended_deadline_raw || assign.deadline_raw}`
                                : `Due: ${assign.deadline_raw || "No deadline stated"}`}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Status Badges Group */}
                      <View style={styles.badgeGroup}>
                        {isSubmitted ? (
                          <View style={styles.badgeSubmitted}>
                            <View style={styles.dotSubmitted} />
                            <Text style={styles.badgeSubmittedText}>Submitted</Text>
                          </View>
                        ) : isMissed ? (
                          <View style={styles.badgeMissed}>
                            <View style={styles.dotMissed} />
                            <Text style={styles.badgeMissedText}>Missed</Text>
                          </View>
                        ) : (
                          <View style={styles.badgePending}>
                            <View style={styles.dotPending} />
                            <Text style={styles.badgePendingText}>Pending</Text>
                          </View>
                        )}

                        {assign.is_extended ? (
                          <View style={styles.badgeExtended}>
                            <Text style={styles.badgeExtendedText}>
                              {assign.extension_type === "missing_only" ? "Missing Only" : "Extended"}
                            </Text>
                          </View>
                        ) : null}

                        {/* Assignment Alarm Button for Pending Assignment */}
                        {!isSubmitted && (
                          <TouchableOpacity
                            style={alarms[assign.id] ? styles.alarmChipActive : styles.alarmChip}
                            onPress={() => {
                              setAlarmTargetAssignment({
                                ...assign,
                                courseName: selectedCourse?.title,
                              });
                              setShowAlarmModal(true);
                            }}
                            activeOpacity={0.75}
                          >
                            <AlarmClock
                              size={11}
                              color={alarms[assign.id] ? "#b45309" : colors.textSecondary}
                            />
                            <Text
                              style={
                                alarms[assign.id]
                                  ? styles.alarmChipTextActive
                                  : styles.alarmChipText
                              }
                            >
                              {alarms[assign.id]
                                ? `${alarms[assign.id].isSnoozed ? "Snoozed" : "Alarm"}: ${new Date(
                                    alarms[assign.id].triggerTimestamp
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}`
                                : "Set Alarm"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Compact File Attachment Chips */}
                    <View style={styles.attachmentBar}>
                      {/* Teacher Brief Chip */}
                      <TouchableOpacity
                        style={[
                          styles.fileChip,
                          !hasTeacherFile && styles.fileChipDisabled,
                        ]}
                        disabled={!hasTeacherFile || isDownloadingTeacher}
                        onPress={() =>
                          handleDownload(
                            assign.teacher_attachment_url || assign.attachment_url,
                            assign.teacher_attachment_name ||
                              assign.attachment_name ||
                              "teacher_brief.pdf",
                            assign.id,
                            "teacher"
                          )
                        }
                        activeOpacity={0.7}
                      >
                        {isDownloadingTeacher ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Download
                            size={13}
                            color={hasTeacherFile ? colors.primary : colors.textMuted}
                          />
                        )}
                        <Text
                          style={[
                            styles.fileChipText,
                            !hasTeacherFile && styles.fileChipTextMuted,
                          ]}
                          numberOfLines={1}
                        >
                          {hasTeacherFile
                            ? assign.teacher_attachment_name || "Brief Document"
                            : "No Brief"}
                        </Text>
                      </TouchableOpacity>

                      {/* My Submission Chip */}
                      <TouchableOpacity
                        style={[
                          styles.fileChip,
                          styles.fileChipSubmission,
                          !hasSubmissionFile && styles.fileChipDisabled,
                        ]}
                        disabled={!hasSubmissionFile || isDownloadingSubmission}
                        onPress={() =>
                          handleDownload(
                            assign.submission_attachment_url,
                            assign.submission_attachment_name || "my_submission.pdf",
                            assign.id,
                            "submission"
                          )
                        }
                        activeOpacity={0.7}
                      >
                        {isDownloadingSubmission ? (
                          <ActivityIndicator size="small" color={colors.statusSafe} />
                        ) : (
                          <FileCheck
                            size={13}
                            color={hasSubmissionFile ? colors.statusSafe : colors.textMuted}
                          />
                        )}
                        <Text
                          style={[
                            styles.fileChipText,
                            hasSubmissionFile && { color: colors.statusSafe, fontWeight: "600" },
                            !hasSubmissionFile && styles.fileChipTextMuted,
                          ]}
                          numberOfLines={1}
                        >
                          {hasSubmissionFile
                            ? assign.submission_attachment_name || "My Submission"
                            : "No Submission"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Actions Area: Submit, Locked, or Modify */}
                    <View style={styles.actionContainer}>
                      {!isSubmitted ? (
                        !isDeadlineExceeded && assign.can_submit ? (
                          <TouchableOpacity
                            style={styles.submitBtn}
                            onPress={() => handlePickAndSubmit(assign)}
                            disabled={submittingId === assign.id}
                            activeOpacity={0.8}
                          >
                            {submittingId === assign.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <UploadCloud size={14} color="#fff" />
                            )}
                            <Text style={styles.submitBtnText}>
                              {submittingId === assign.id ? "Uploading to LMS..." : "Submit Assignment"}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.lockRow}>
                            <Lock size={12} color={colors.statusDanger} />
                            <Text style={[styles.lockText, { color: colors.statusDanger }]}>
                              Deadline Exceeded • Submissions closed
                            </Text>
                          </View>
                        )
                      ) : (
                        /* When Submitted: Check strictly if deadline passed */
                        isDeadlineExceeded ? (
                          <View style={styles.lockRow}>
                            <Lock size={12} color={colors.textMuted} />
                            <Text style={styles.lockText}>
                              Deadline closed • Submission preserved on LMS
                            </Text>
                          </View>
                        ) : assign.is_extended && assign.extension_type === "missing_only" ? (
                          <View style={styles.lockRow}>
                            <Lock size={12} color="#b45309" />
                            <Text style={[styles.lockText, { color: "#b45309" }]}>
                              Extension is for missing students only • Submission locked
                            </Text>
                          </View>
                        ) : (
                          /* Open submission: Student can delete or re-upload before deadline */
                          <View style={styles.submissionModifyRow}>
                            <TouchableOpacity
                              style={styles.deleteBtn}
                              onPress={() => handleDeleteSubmission(assign)}
                              disabled={deletingId === assign.id}
                              activeOpacity={0.8}
                            >
                              {deletingId === assign.id ? (
                                <ActivityIndicator size="small" color={colors.statusDanger} />
                              ) : (
                                <Trash2 size={13} color={colors.statusDanger} />
                              )}
                              <Text style={styles.deleteBtnText}>Delete</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.reuploadBtn}
                              onPress={() => handlePickAndSubmit(assign)}
                              disabled={submittingId === assign.id}
                              activeOpacity={0.8}
                            >
                              {submittingId === assign.id ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                              ) : (
                                <UploadCloud size={13} color={colors.primary} />
                              )}
                              <Text style={styles.reuploadBtnText}>Re-upload</Text>
                            </TouchableOpacity>
                          </View>
                        )
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  courseSelectContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  courseDropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  courseDropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  courseIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  courseSelectMicroLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  courseDropdownTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 48,
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 10,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.statusWarningBg,
    borderWidth: 1,
    borderColor: colors.statusWarningBorder,
    marginHorizontal: 14,
    marginTop: 8,
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
  noCourseContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  noCourseIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  noCourseTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  noCourseSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  assignmentsContainer: {
    gap: 10,
  },
  courseMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  courseMetaText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  courseMetaSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyCourseState: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  emptyCourseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 8,
  },
  emptyCourseSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },

  /* Sleek Modern Assignment Card */
  assignmentCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorderSubtle,
    borderLeftWidth: 4,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 12,
  },
  cardAccentSubmitted: {
    borderLeftColor: "#059669",
  },
  cardAccentPending: {
    borderLeftColor: "#2563eb",
  },
  cardAccentMissed: {
    borderLeftColor: "#dc2626",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  indexBadge: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  indexBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  assignmentTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 20,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  dateText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
  },
  badgeGroup: {
    alignItems: "flex-end",
    gap: 6,
  },
  badgeSubmitted: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  dotSubmitted: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#059669",
  },
  badgeSubmittedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  badgeMissed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  dotMissed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#dc2626",
  },
  badgeMissedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#dc2626",
  },
  badgePending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  dotPending: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2563eb",
  },
  badgePendingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
  },
  badgeExtended: {
    backgroundColor: "#fffbeb",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  badgeExtendedText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  alarmChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  alarmChipActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fef3c7",
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 1,
  },
  alarmChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b45309",
  },
  alarmChipTextActive: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
  },

  /* Compact Attachment Chips Bar */
  attachmentBar: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    marginBottom: 10,
  },
  fileChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  fileChipSubmission: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  fileChipDisabled: {
    opacity: 0.55,
    backgroundColor: colors.surfaceSecondary,
  },
  fileChipText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: "500",
    flex: 1,
  },
  fileChipTextMuted: {
    color: colors.textMuted,
  },

  /* Actions Area */
  actionContainer: {
    marginTop: 2,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  lockText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
  submissionModifyRow: {
    flexDirection: "row",
    gap: 8,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.statusDanger,
  },
  reuploadBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  reuploadBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxHeight: "75%",
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  modalHeaderTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalList: {
    padding: 10,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  modalItemActive: {
    backgroundColor: colors.primarySubtle,
  },
  modalItemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  modalItemTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  modalItemSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
