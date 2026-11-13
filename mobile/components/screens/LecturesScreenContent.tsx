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
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Notifications from "expo-notifications";
import { colors } from "../../theme/colors";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { SyncBanner } from "../SyncBanner";
import { showDownloadSuccessToast } from "../../stores/downloadToastStore";
import { saveAcademicDataToSQLite, getOfflineAcademicDataFromSQLite } from "../../services/offlineDb";
import { getDownloadDirectory, getSecureItem, KEYS } from "../../services/storage";
import {
  updateDownloadProgressNotification,
  showDownloadCompleteNotification,
  dismissDownloadNotification,
  ensureNotificationPermissions,
} from "../../services/notifications";
import {
  registerDownloadedFile,
  openDownloadedFile,
  getMimeType,
} from "../../services/downloadsRegistry";
import { useDownloadQueueStore } from "../../stores/downloadQueueStore";
import {
  FileText,
  Download,
  FolderArchive,
  WifiOff,
  BookOpen,
  ChevronDown,
  X,
  Check,
  Search,
  CheckCircle2,
  GraduationCap,
  FolderDown,
  Layers,
} from "lucide-react-native";

export const LecturesScreenContent: React.FC = () => {
  const { account, isSyncing, syncProgressStep, syncNow } = useAuthStore();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [showCourseModal, setShowCourseModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ZIP Export State
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);
  const [zipProgressPercent, setZipProgressPercent] = useState<number>(0);
  const [zipStatusText, setZipStatusText] = useState<string>("");
  const [zipComplete, setZipComplete] = useState<boolean>(false);

  // Sequential Download All Queue (Zustand Global Store)
  const activeDownload = useDownloadQueueStore();

  const [offlineMaterials, setOfflineMaterials] = useState<any[] | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const {
    data: courses,
    isLoading: isCoursesLoading,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.getCourses(),
    refetchInterval: 15000,
  });

  const {
    data: materials,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["materials", selectedCourseId],
    queryFn: () => api.getMaterials({ course_id: selectedCourseId || undefined }),
    retry: 1,
    refetchInterval: 12000, // Continuous real-time updates every 12s
  });

  // Automatically refresh courses and materials whenever user opens this tab
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

  useEffect(() => {
    if (materials && materials.length > 0 && !selectedCourseId) {
      saveAcademicDataToSQLite({ materials });
    }
  }, [materials, selectedCourseId]);

  useEffect(() => {
    getOfflineAcademicDataFromSQLite().then((cached) => {
      if (cached && cached.materials && cached.materials.length > 0) {
        setOfflineMaterials(cached.materials);
      }
    });
  }, [isError]);

  const rawMaterials = materials || offlineMaterials || [];
  const isOffline = !materials && !!offlineMaterials;

  // Deduplicate courses by normalized title (preferring clean university course codes like "CSC 321" over truncated names)
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

  // Extract natural sequence number from lecture titles (e.g. "Lecture #1", "Week 2", "Lab 03")
  const extractSequenceNumber = (item: any): number => {
    const combined = `${item.week_number || ""} ${item.title || ""} ${item.file_name || ""}`;
    const match = combined.match(/(?:lecture|week|lab|task|#)?\s*#?\s*0*(\d+)/i);
    return match && match[1] ? parseInt(match[1], 10) : 9999;
  };

  // Filter and naturally sort lecture materials sequentially
  const effectiveMaterials = useMemo(() => {
    if (!selectedCourseId || !selectedCourse) return [];

    let list = rawMaterials.filter((m: any) => {
      if (m.course_id && m.course_id === selectedCourse.id) return true;
      const cTitle = (selectedCourse.title || "").trim().toLowerCase();
      const mName = (m.course_name || "").trim().toLowerCase();
      if (!mName || !cTitle) return false;
      if (mName === cTitle) return true;
      const isMLab = mName.includes("lab");
      const isCLab = cTitle.includes("lab");
      if (isMLab !== isCLab) return false;
      return mName.includes(cTitle) || cTitle.includes(mName);
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m: any) =>
          m.title?.toLowerCase().includes(q) ||
          m.week_number?.toLowerCase().includes(q) ||
          m.file_name?.toLowerCase().includes(q)
      );
    }

    // Sort sequentially: Lecture 1, Lecture 2, Lecture 3...
    return list.slice().sort((a: any, b: any) => {
      const seqA = extractSequenceNumber(a);
      const seqB = extractSequenceNumber(b);
      if (seqA !== seqB) return seqA - seqB;
      return (a.file_name || "").localeCompare(b.file_name || "");
    });
  }, [rawMaterials, selectedCourseId, selectedCourse, searchQuery]);

  const isThisCourseDownloading =
    activeDownload.isActive && activeDownload.courseTitle === selectedCourse?.title;
  const isAnyDownloading = activeDownload.isActive;

  // Download single lecture file to configured download path with background support
  const handleDownloadFile = async (url: string, name: string, materialId: string) => {
    setDownloadingFileId(materialId);
    const courseTitle = selectedCourse?.title || "Lecture Download";
    useDownloadQueueStore.getState().setDownloadStarted(courseTitle, 1);
    useDownloadQueueStore.getState().setDownloadProgress(name, 1, 0);

    try {
      await ensureNotificationPermissions();
      const targetDir = await getDownloadDirectory();
      const downloadUrl = await api.getFileDownloadUrl({
        materialId,
        url,
        filename: name,
      });

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          const anchor = document.createElement("a");
          anchor.href = downloadUrl;
          anchor.download = name;
          anchor.target = "_blank";
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        }
        useDownloadQueueStore.getState().setDownloadCompleted();
        setDownloadingFileId(null);
        return;
      }

      // Ensure download directory exists on native device
      try {
        await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      } catch {}

      const fileUri = `${targetDir}${name}`;

      await updateDownloadProgressNotification({
        title: `Downloading Lecture Slide`,
        percent: 0,
        filename: name,
        force: true,
      });

      const token = await getSecureItem(KEYS.ACCESS_TOKEN);
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Background-capable native download session
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        fileUri,
        {
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          headers,
        },
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            const pct = Math.round(
              (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100
            );
            useDownloadQueueStore.getState().setDownloadProgress(name, 1, pct);
            updateDownloadProgressNotification({
              title: `Downloading Lecture Slide`,
              percent: pct,
              filename: name,
            });
          }
        }
      );

      const res = await downloadResumable.downloadAsync();
      useDownloadQueueStore.getState().setDownloadCompleted();

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
          useDownloadQueueStore.getState().clearActiveDownload();
          await dismissDownloadNotification();
          Alert.alert(
            "Download Incomplete",
            "The university portal returned an expired session or unauthorized page instead of the lecture document. Please pull down to refresh and try downloading again."
          );
          return;
        }

        await registerDownloadedFile({
          fileName: name,
          fileUri: res.uri,
          courseName: selectedCourse?.title,
          category: "lecture",
          mimeType: getMimeType(name),
        });

        await showDownloadCompleteNotification({
          title: `Download Complete! ✅`,
          message: `${name} saved to downloads.`,
        });

        // Modern, non-blocking in-app download success toast
        showDownloadSuccessToast({
          fileName: name,
          fileUri: res.uri,
          mimeType: getMimeType(name),
          category: "lecture",
          courseName: selectedCourse?.title,
        });
      } else {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch {}
        useDownloadQueueStore.getState().clearActiveDownload();
        await dismissDownloadNotification();
        Alert.alert("Download Error", "Could not fetch lecture note from portal.");
      }
    } catch (e: any) {
      useDownloadQueueStore.getState().clearActiveDownload();
      await dismissDownloadNotification();
      Alert.alert("Download Failed", e.message || "An error occurred downloading lecture.");
    } finally {
      setDownloadingFileId(null);
    }
  };

  // SEQUENTIAL DOWNLOAD ALL: Downloads every lecture in sequential order with background support + Notification Progress Bar
  const handleDownloadAllLectures = async () => {
    if (!selectedCourseId || !selectedCourse) {
      Alert.alert("Choose Course", "Please select a course to download its lectures.");
      return;
    }

    if (activeDownload.isActive) {
      Alert.alert(
        "Download in Progress",
        `Currently downloading lectures for ${activeDownload.courseTitle}. You can track live progress in the notification bar or in the Downloads tab.`
      );
      return;
    }

    if (effectiveMaterials.length === 0) {
      Alert.alert("No Materials", "No lecture materials were found for this course.");
      return;
    }

    await ensureNotificationPermissions();

    const total = effectiveMaterials.length;
    const courseTitle = selectedCourse.title;
    useDownloadQueueStore.getState().setDownloadStarted(courseTitle, total);

    const targetDir = await getDownloadDirectory();

    // Ensure target directory exists on device
    if (Platform.OS !== "web") {
      try {
        await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      } catch {}
    }

    try {
      for (let i = 0; i < total; i++) {
        const item = effectiveMaterials[i];
        const fileName = item.file_name || `Lecture_${i + 1}.pdf`;
        const basePct = Math.round((i / total) * 100);

        useDownloadQueueStore.getState().setDownloadProgress(fileName, i + 1, basePct);

        // Immediate initial notification for the active file
        await updateDownloadProgressNotification({
          title: `Downloading: ${courseTitle}`,
          percent: basePct,
          current: i + 1,
          total,
          filename: fileName,
          force: true,
        });

        const downloadUrl = await api.getFileDownloadUrl({
          materialId: item.id,
          url: item.file_url,
          filename: fileName,
        });

        if (Platform.OS === "web") {
          if (typeof window !== "undefined") {
            const anchor = document.createElement("a");
            anchor.href = downloadUrl;
            anchor.download = fileName;
            anchor.target = "_blank";
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
          }
          await new Promise((r) => setTimeout(r, 450));
        } else {
          const fileUri = `${targetDir}${fileName}`;
          const token = await getSecureItem(KEYS.ACCESS_TOKEN);
          const headers: Record<string, string> = {};
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          // Background session enabled for each file
          const downloadResumable = FileSystem.createDownloadResumable(
            downloadUrl,
            fileUri,
            {
              sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
              headers,
            },
            (progress) => {
              if (progress.totalBytesExpectedToWrite > 0) {
                const fraction = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
                const overallPct = Math.min(
                  99,
                  Math.round(((i + fraction) / total) * 100)
                );
                useDownloadQueueStore.getState().setDownloadProgress(fileName, i + 1, overallPct);
                updateDownloadProgressNotification({
                  title: `Downloading: ${courseTitle}`,
                  percent: overallPct,
                  current: i + 1,
                  total,
                  filename: fileName,
                });
              }
            }
          );
          const dlRes = await downloadResumable.downloadAsync();
          if (dlRes && dlRes.status === 200) {
            let isCorrupted = false;
            try {
              const headerSnippet = await FileSystem.readAsStringAsync(dlRes.uri || fileUri, {
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

            if (!isCorrupted) {
              await registerDownloadedFile({
                fileName,
                fileUri: dlRes.uri || fileUri,
                courseName: courseTitle,
                category: "lecture",
                mimeType: getMimeType(fileName),
              });
            } else {
              try {
                await FileSystem.deleteAsync(dlRes.uri || fileUri, { idempotent: true });
              } catch {}
            }
          } else {
            try {
              await FileSystem.deleteAsync(fileUri, { idempotent: true });
            } catch {}
          }
        }
      }

      useDownloadQueueStore.getState().setDownloadCompleted();

      // Final Notification: Download Complete with sound & alert
      await showDownloadCompleteNotification({
        title: `All Lectures Downloaded! 🎉`,
        message: `Saved all ${total} lectures for ${courseTitle} to ${targetDir}`,
      });
    } catch (e: any) {
      useDownloadQueueStore.getState().clearActiveDownload();
      await dismissDownloadNotification();
      Alert.alert("Download Interrupted", e.message || "An error occurred during sequential download.");
    }
  };

  // ZIP export handler with background downloading and notification progress tracking
  const handleDownloadCourseZip = async () => {
    if (!selectedCourseId || !selectedCourse) return;

    await ensureNotificationPermissions();
    const courseTitle = selectedCourse.title || "Course";
    setDownloadingZip(true);
    setZipComplete(false);
    setZipProgressPercent(10);
    setZipStatusText("Connecting to Bahria LMS and packing slides...");
    useDownloadQueueStore.getState().setDownloadStarted(`${courseTitle} (ZIP)`, 1);
    useDownloadQueueStore.getState().setDownloadProgress(`${courseTitle}_Materials.zip`, 1, 10);

    try {
      const downloadUrl = await api.getCourseZipDownloadUrl(selectedCourseId);
      const zipFileName = `${courseTitle.replace(/[^a-zA-Z0-9]/g, "_")}_Materials.zip`;

      if (Platform.OS === "web") {
        setZipProgressPercent(50);
        setZipStatusText("Compressing archive on server...");
        useDownloadQueueStore.getState().setDownloadProgress(zipFileName, 1, 50);
        await new Promise((r) => setTimeout(r, 600));

        setZipProgressPercent(90);
        setZipStatusText("Finalizing ZIP archive...");
        useDownloadQueueStore.getState().setDownloadProgress(zipFileName, 1, 90);
        await new Promise((r) => setTimeout(r, 400));

        if (typeof window !== "undefined") {
          const anchor = document.createElement("a");
          anchor.href = downloadUrl;
          anchor.download = zipFileName;
          anchor.target = "_blank";
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        }

        setZipProgressPercent(100);
        setZipStatusText("Course ZIP successfully prepared and downloaded!");
        setZipComplete(true);
        useDownloadQueueStore.getState().setDownloadCompleted();
        return;
      }

      const targetDir = await getDownloadDirectory();
      try {
        await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      } catch {}

      const fileUri = `${targetDir}${zipFileName}`;
      setZipProgressPercent(25);
      setZipStatusText("Downloading archive to device storage...");
      useDownloadQueueStore.getState().setDownloadProgress(zipFileName, 1, 25);

      await updateDownloadProgressNotification({
        title: `Downloading ${courseTitle} (ZIP)`,
        percent: 25,
        filename: zipFileName,
        force: true,
      });

      // Background download session
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        fileUri,
        {
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
        },
        (prog) => {
          if (prog.totalBytesExpectedToWrite > 0) {
            const raw = prog.totalBytesWritten / prog.totalBytesExpectedToWrite;
            const pct = Math.min(98, Math.max(25, Math.round(raw * 100)));
            setZipProgressPercent(pct);
            setZipStatusText(`Streaming archive: ${pct}%`);
            useDownloadQueueStore.getState().setDownloadProgress(zipFileName, 1, pct);
            updateDownloadProgressNotification({
              title: `Downloading ${courseTitle} (ZIP)`,
              percent: pct,
              filename: zipFileName,
            });
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (result && result.status === 200) {
        setZipProgressPercent(100);
        setZipStatusText("ZIP archive saved to device!");
        setZipComplete(true);
        useDownloadQueueStore.getState().setDownloadCompleted();

        await registerDownloadedFile({
          fileName: zipFileName,
          fileUri: result.uri,
          courseName: selectedCourse?.title,
          category: "archive",
          mimeType: "application/zip",
        });

        await showDownloadCompleteNotification({
          title: `ZIP Archive Downloaded! 🎉`,
          message: `${zipFileName} saved to ${targetDir}`,
        });

        // Modern, non-blocking in-app download success toast
        showDownloadSuccessToast({
          fileName: zipFileName,
          fileUri: result.uri,
          mimeType: "application/zip",
          category: "lecture",
          courseName: selectedCourse?.title,
        });
      } else {
        useDownloadQueueStore.getState().clearActiveDownload();
        await dismissDownloadNotification();
        Alert.alert("Export Error", "Could not download ZIP archive from server.");
        setDownloadingZip(false);
      }
    } catch (e: any) {
      useDownloadQueueStore.getState().clearActiveDownload();
      await dismissDownloadNotification();
      Alert.alert("Export Failed", e.message || "An error occurred assembling ZIP archive.");
      setDownloadingZip(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.screenTitle}>Lectures & Notes</Text>
          <Text style={styles.screenSubtitle}>
            {selectedCourse
              ? `Sequential lecture slides for ${selectedCourse.title}`
              : "Select a course to view sequential lecture slides"}
          </Text>
        </View>
      </View>

      {/* Sync Status Banner */}
      <SyncBanner
        isSyncing={isSyncing}
        syncStep={syncProgressStep}
        lastSyncedAt={account?.last_synced_at}
        cloudMonitoringEnabled={account?.cloud_monitoring_enabled}
        onSyncPress={handleManualSync}
      />

      {/* Prominent Course Selector Dropdown (No 'All Enrolled Courses' mix) */}
      <View style={styles.courseSelectContainer}>
        <Text style={styles.courseSelectLabel}>SELECT COURSE:</Text>
        <TouchableOpacity
          style={[
            styles.courseDropdownButton,
            selectedCourse && styles.courseDropdownButtonSelected,
          ]}
          onPress={() => setShowCourseModal(true)}
          activeOpacity={0.8}
        >
          <BookOpen
            size={18}
            color={selectedCourse ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.courseDropdownText,
              selectedCourse && styles.courseDropdownTextSelected,
            ]}
            numberOfLines={1}
          >
            {selectedCourse ? `${selectedCourse.code || ""} ${selectedCourse.title}` : "Choose a Course..."}
          </Text>
          <ChevronDown size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Course Selection Modal (Clean list of enrolled subjects) */}
      <Modal
        visible={showCourseModal}
        transparent={true}
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
                <GraduationCap size={20} color={colors.primary} />
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
              {(cleanCourses || []).map((c: any) => {
                const isSelected = selectedCourseId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                    onPress={() => {
                      setSelectedCourseId(c.id);
                      setShowCourseModal(false);
                    }}
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

      {/* Course ZIP Progress Modal */}
      <Modal
        visible={downloadingZip}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (zipComplete) setDownloadingZip(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.progressModalCard}>
            <View style={styles.progressModalHeader}>
              <View style={styles.progressIconCircle}>
                {zipComplete ? (
                  <CheckCircle2 size={24} color="#059669" />
                ) : (
                  <FolderArchive size={24} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.progressModalTitle}>
                  {zipComplete ? "ZIP Archive Ready!" : "Assembling Course ZIP"}
                </Text>
                <Text style={styles.progressModalSubtitle} numberOfLines={1}>
                  {selectedCourse?.title}
                </Text>
              </View>
            </View>

            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${zipProgressPercent}%` }]} />
            </View>

            <View style={styles.progressStatusRow}>
              <Text style={styles.progressStatusText} numberOfLines={1}>
                {zipStatusText}
              </Text>
              <Text style={styles.progressPercentText}>{zipProgressPercent}%</Text>
            </View>

            {zipComplete ? (
              <TouchableOpacity
                style={styles.progressDoneButton}
                onPress={() => setDownloadingZip(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.progressDoneButtonText}>Done</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Offline Mode Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <WifiOff size={14} color={colors.statusWarning} />
          <Text style={styles.offlineBannerText}>
            Offline Mode: Displaying saved course lecture materials from device storage.
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
        {isLoading && rawMaterials.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading lecture notes from Bahria LMS...</Text>
          </View>
        ) : !selectedCourseId ? (
          /* EMPTY PROMPT: Tell user to choose a course with an icon */
          <View style={styles.noCourseContainer}>
            <View style={styles.noCourseIconCircle}>
              <GraduationCap size={44} color={colors.primary} />
            </View>
            <Text style={styles.noCourseTitle}>Choose a Course</Text>
            <Text style={styles.noCourseSubtitle}>
              Select a course from the dropdown above to view and download all its lecture slides and documents sequentially.
            </Text>

            {/* Quick-Pick Course Chips */}
            {cleanCourses && cleanCourses.length > 0 && (
              <View style={styles.quickPickBox}>
                <Text style={styles.quickPickLabel}>OR TAP A COURSE BELOW:</Text>
                <View style={styles.chipsContainer}>
                  {cleanCourses.map((c: any) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.courseChip}
                      onPress={() => setSelectedCourseId(c.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.courseChipCode}>{c.code || "Course"}</Text>
                      <Text style={styles.courseChipTitle} numberOfLines={1}>
                        {c.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : (
          /* SELECTED COURSE: Show sequential lectures with Download All + Export ZIP buttons */
          <View style={styles.materialsContainer}>
            {/* Course Header Banner */}
            <View style={styles.selectedCourseBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedCourseCode}>
                  {selectedCourse?.code || "REGISTERED COURSE"}
                </Text>
                <Text style={styles.selectedCourseTitle}>{selectedCourse?.title}</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {effectiveMaterials.length} Lecture{effectiveMaterials.length === 1 ? "" : "s"}
                </Text>
              </View>
            </View>

            {/* Action Buttons: 1. Download All (Sequential), 2. Export ZIP */}
            {effectiveMaterials.length > 0 && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[
                    styles.downloadAllBtn,
                    isThisCourseDownloading && styles.downloadAllBtnActive,
                    isAnyDownloading && !isThisCourseDownloading && styles.downloadAllBtnDisabled,
                  ]}
                  onPress={handleDownloadAllLectures}
                  disabled={isAnyDownloading}
                  activeOpacity={0.8}
                >
                  {isThisCourseDownloading ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.downloadAllBtnText}>
                        Downloading ({activeDownload.currentIndex}/{activeDownload.totalCount})...
                      </Text>
                    </>
                  ) : (
                    <>
                      <FolderDown size={16} color="#fff" />
                      <Text style={styles.downloadAllBtnText}>Download All Sequentially</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.zipExportBtn,
                    (downloadingZip || isAnyDownloading) && styles.zipExportBtnDisabled,
                  ]}
                  onPress={handleDownloadCourseZip}
                  disabled={downloadingZip || isAnyDownloading}
                  activeOpacity={0.8}
                >
                  <FolderArchive size={15} color={colors.primary} />
                  <Text style={styles.zipExportBtnText}>ZIP</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Non-Blocking Inline Background Download Banner */}
            {isThisCourseDownloading && (
              <View style={styles.inlineProgressCard}>
                <View style={styles.inlineProgressHeader}>
                  <View style={styles.inlineProgressIconBox}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={styles.inlineProgressTopRow}>
                      <View style={styles.inlineBadge}>
                        <Text style={styles.inlineBadgeText}>DOWNLOADING IN BACKGROUND</Text>
                      </View>
                      <Text style={styles.inlinePercentText}>{activeDownload.percent}%</Text>
                    </View>
                    <Text style={styles.inlineCurrentFile} numberOfLines={1}>
                      File {activeDownload.currentIndex} of {activeDownload.totalCount}: {activeDownload.currentFileName}
                    </Text>
                  </View>
                </View>
                <View style={styles.inlineProgressBarTrack}>
                  <View style={[styles.inlineProgressBarFill, { width: `${activeDownload.percent}%` }]} />
                </View>
                <Text style={styles.inlineHintText}>
                  ⚡ Downloading smoothly in background. Feel free to navigate across tabs or check the Downloads tab.
                </Text>
              </View>
            )}

            {/* Search Input for filtering course lectures */}
            {effectiveMaterials.length > 3 && (
              <View style={styles.searchBox}>
                <Search size={15} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Filter lecture slides or topics..."
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {effectiveMaterials.length === 0 ? (
              <View style={styles.emptyCourseState}>
                <CheckCircle2 size={36} color={colors.statusSafe} />
                <Text style={styles.emptyCourseTitle}>No Lectures Found</Text>
                <Text style={styles.emptyCourseSubtitle}>
                  No lecture notes or slides have been uploaded for {selectedCourse?.title} on Bahria LMS yet.
                </Text>
              </View>
            ) : (
              effectiveMaterials.map((mat: any, idx: number) => {
                const isItemDownloading = downloadingFileId === mat.id;
                const seqNumber = extractSequenceNumber(mat);

                return (
                  <View key={mat.id || idx} style={styles.materialCard}>
                    {/* Sequential Number Circle */}
                    <View style={styles.seqNumberBox}>
                      <Text style={styles.seqNumberText}>
                        {seqNumber < 9999 ? `#${seqNumber}` : `#${idx + 1}`}
                      </Text>
                    </View>

                    <View style={styles.matDetails}>
                      <View style={styles.matTopRow}>
                        <Text style={styles.matWeekNumber} numberOfLines={1}>
                          {mat.week_number || `Lecture #${idx + 1}`}
                        </Text>
                        <View style={styles.fileTypeBadge}>
                          <Text style={styles.fileTypeBadgeText}>
                            {(mat.file_type || "PDF").toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.matTitle} numberOfLines={2}>
                        {mat.title}
                      </Text>

                      <Text style={styles.matFilename} numberOfLines={1}>
                        {mat.file_name}
                      </Text>
                    </View>

                    {/* Single Download Button */}
                    <TouchableOpacity
                      style={[styles.downloadBtn, isItemDownloading && styles.downloadBtnActive]}
                      onPress={() => handleDownloadFile(mat.file_url, mat.file_name, mat.id)}
                      disabled={isItemDownloading}
                      activeOpacity={0.7}
                    >
                      {isItemDownloading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Download size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
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
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  screenSubtitle: {
    fontSize: 13,
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
  courseSelectLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  courseDropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  courseDropdownButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  courseDropdownText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  courseDropdownTextSelected: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.statusWarningBg,
    borderWidth: 1,
    borderColor: colors.statusWarningBorder,
    marginHorizontal: 16,
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
  // EMPTY PROMPT WHEN NO COURSE SELECTED
  noCourseContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noCourseIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  noCourseTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  noCourseSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  quickPickBox: {
    width: "100%",
    marginTop: 32,
  },
  quickPickLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
    textAlign: "center",
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  courseChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "48%",
  },
  courseChipCode: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  courseChipTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 2,
  },
  // SELECTED COURSE MATERIALS LIST
  materialsContainer: {
    gap: 12,
  },
  selectedCourseBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  selectedCourseCode: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  selectedCourseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  downloadAllBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  downloadAllBtnActive: {
    backgroundColor: "#1D4ED8",
  },
  downloadAllBtnDisabled: {
    opacity: 0.5,
  },
  downloadAllBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  zipExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  zipExportBtnDisabled: {
    opacity: 0.5,
  },
  zipExportBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  inlineProgressCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginTop: 4,
    marginBottom: 4,
  },
  inlineProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  inlineProgressIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineProgressTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  inlineBadge: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inlineBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  inlinePercentText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  inlineCurrentFile: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  inlineProgressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    marginBottom: 6,
  },
  inlineProgressBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  inlineHintText: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    height: "100%",
  },
  emptyCourseState: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  emptyCourseTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 10,
  },
  emptyCourseSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  // MATERIAL CARD
  materialCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 12,
  },
  seqNumberBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  seqNumberText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  matDetails: {
    flex: 1,
  },
  matTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  matWeekNumber: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    flex: 1,
    marginRight: 6,
  },
  fileTypeBadge: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileTypeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textSecondary,
  },
  matTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
    lineHeight: 18,
  },
  matFilename: {
    fontSize: 11,
    color: colors.textMuted,
  },
  downloadBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  downloadBtnActive: {
    backgroundColor: "#dbeafe",
  },
  // PROGRESS MODAL
  progressModalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  progressModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  progressIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  progressModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  progressModalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressStatusText: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  progressDoneButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  progressDoneButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  // SELECTION MODAL
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  modalHeaderTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  modalItemActive: {
    backgroundColor: colors.primarySubtle,
  },
  modalItemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  modalItemTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  modalItemSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
