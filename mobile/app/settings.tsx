import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import {
  getServerUrl,
  setServerUrl,
  DEFAULT_API_URL,
  getHomeScreenPreferences,
  saveHomeScreenPreferences,
  HomeScreenPreferences,
  getDownloadDirectory,
  setDownloadDirectory,
  resetDownloadDirectory,
  DEFAULT_DOWNLOAD_DIR,
} from "../services/storage";
import {
  User,
  Shield,
  Server,
  Bell,
  Sliders,
  Trash2,
  LogOut,
  Send,
  Cloud,
  Check,
  ChevronRight,
  ArrowLeft,
  LayoutGrid,
  FolderDown,
  RotateCcw,
  Sparkles,
} from "lucide-react-native";
import { checkForAppUpdate, UpdateInfo, getCurrentAppVersion } from "../services/updater";
import { InAppUpdateModal } from "../components/InAppUpdateModal";

export default function SettingsScreen() {
  const router = useRouter();
  const { account, user, disconnectLMS, logout } = useAuthStore();

  const [serverUrlInput, setServerUrlInput] = useState(DEFAULT_API_URL);
  const [downloadPath, setDownloadPath] = useState(DEFAULT_DOWNLOAD_DIR);
  const [cloudMonitoring, setCloudMonitoring] = useState(false);
  const [threshold, setThreshold] = useState("75");

  // Notification Preferences State
  const [assignAlerts, setAssignAlerts] = useState(true);
  const [attendanceAlerts, setAttendanceAlerts] = useState(true);
  const [materialsAlerts, setMaterialsAlerts] = useState(true);
  const [remind48h, setRemind48h] = useState(true);
  const [remind24h, setRemind24h] = useState(true);
  const [remind3h, setRemind3h] = useState(true);

  // Home Screen Section Visibility State
  const [showPendingHome, setShowPendingHome] = useState(true);
  const [showMissedHome, setShowMissedHome] = useState(true);
  const [showLowAttendanceHome, setShowLowAttendanceHome] = useState(true);

  // In-App Updates State
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkForAppUpdate();
      if (info.isAvailable) {
        setUpdateInfo(info);
        setShowUpdateModal(true);
      } else {
        Alert.alert(
          "Up to Date! 🎉",
          `CampusFlow v${getCurrentAppVersion()} is currently the newest version available.`
        );
      }
    } catch (err: any) {
      Alert.alert("Update Check Failed", err.message || "Could not connect to update server.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    getServerUrl().then((u) => setServerUrlInput(u));
    getDownloadDirectory().then((p) => setDownloadPath(p));
    if (account) {
      setCloudMonitoring(!!account.cloud_monitoring_enabled);
    }
    getHomeScreenPreferences().then((p) => {
      setShowPendingHome(p.showPending);
      setShowMissedHome(p.showMissed);
      setShowLowAttendanceHome(p.showLowAttendance);
    });
  }, [account]);

  const handleSaveDownloadPath = async () => {
    if (!downloadPath.trim()) {
      await resetDownloadDirectory();
      setDownloadPath(DEFAULT_DOWNLOAD_DIR);
      Alert.alert("Default Restored", `Download path set to default:\n${DEFAULT_DOWNLOAD_DIR}`);
      return;
    }
    await setDownloadDirectory(downloadPath);
    Alert.alert("Download Path Updated", `Lectures and assignments will be saved to:\n${downloadPath}`);
  };

  const handleResetDownloadPath = async () => {
    await resetDownloadDirectory();
    setDownloadPath(DEFAULT_DOWNLOAD_DIR);
    Alert.alert("Reset to Default", `Download path reset to:\n${DEFAULT_DOWNLOAD_DIR}`);
  };

  const updateHomeScreenPref = async (key: keyof HomeScreenPreferences, val: boolean) => {
    const updated: HomeScreenPreferences = {
      showPending: key === "showPending" ? val : showPendingHome,
      showMissed: key === "showMissed" ? val : showMissedHome,
      showLowAttendance: key === "showLowAttendance" ? val : showLowAttendanceHome,
    };
    if (key === "showPending") setShowPendingHome(val);
    if (key === "showMissed") setShowMissedHome(val);
    if (key === "showLowAttendance") setShowLowAttendanceHome(val);
    await saveHomeScreenPreferences(updated);
  };

  const { data: prefs, refetch: refetchPrefs } = useQuery({
    queryKey: ["notification_preferences"],
    queryFn: async () => {
      const p = await api.getPreferences();
      setAssignAlerts(p.assignments_enabled);
      setAttendanceAlerts(p.attendance_enabled);
      setMaterialsAlerts(p.materials_enabled);
      setRemind48h(p.reminder_48h);
      setRemind24h(p.reminder_24h);
      setRemind3h(p.reminder_3h);
      setThreshold(String(p.min_attendance_threshold || 75));
      return p;
    },
  });

  const savePreferences = async () => {
    try {
      await api.updatePreferences({
        assignments_enabled: assignAlerts,
        attendance_enabled: attendanceAlerts,
        materials_enabled: materialsAlerts,
        grades_enabled: true,
        reminder_48h: remind48h,
        reminder_24h: remind24h,
        reminder_3h: remind3h,
        min_attendance_threshold: parseFloat(threshold) || 75.0,
        quiet_hours_enabled: false,
        quiet_start_hour: 23,
        quiet_end_hour: 7,
      });
      Alert.alert("Success", "Settings and notification preferences saved.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update preferences.");
    }
  };

  const handleSaveServerUrl = async () => {
    await setServerUrl(serverUrlInput);
    Alert.alert("Server URL Updated", `API requests will now route to ${serverUrlInput}.`);
  };

  const handleTestNotification = async (type: "general" | "deadline" = "general") => {
    try {
      const title = type === "deadline"
        ? "Assignment Deadline Alert ⏳"
        : "CampusFlow: Test Notification 🔔";
      const body = type === "deadline"
        ? "Design and Analysis of Algorithm: Assignment 02 is due in 24 hours!"
        : "Your CampusFlow notification engine is connected and operating reliably!";

      // 1. Immediately schedule local device notification banner & sound
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              sound: true,
              data: { type: "TEST_NOTIFICATION", timestamp: Date.now() },
            },
            trigger: null,
          });
        }
      } catch (notifErr) {
        console.warn("Local notification error:", notifErr);
      }

      // 2. Also dispatch via backend API
      try {
        await api.testPushNotification(title, body);
      } catch (backendErr) {
        // Backend push dispatch is optional if no remote push token registered
      }

      Alert.alert(
        "🔔 Notification Triggered!",
        `Notification "${title}" was generated. Check your notification tray or banner.`
      );
    } catch (e: any) {
      Alert.alert("Notification Error", e.message || "Could not generate notification.");
    }
  };

  const handleToggleCloud = async (val: boolean) => {
    if (val) {
      Alert.prompt(
        "Enable Cloud Monitoring",
        "Enter your Bahria University portal password to encrypt with AES-256-GCM for 24/7 background deadline alerts.",
        async (enteredPassword) => {
          if (!enteredPassword) return;
          try {
            await api.toggleCloudMonitoring(true, enteredPassword);
            setCloudMonitoring(true);
            Alert.alert("Cloud Monitoring Enabled", "Stored credentials are protected with AES-256-GCM encryption.");
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
        "secure-text"
      );
    } else {
      try {
        await api.toggleCloudMonitoring(false);
        setCloudMonitoring(false);
        Alert.alert("Disabled", "Cloud monitoring disabled. All stored credentials deleted from server.");
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Settings & Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Student Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <User size={24} color="#fff" />
          </View>
          <View style={styles.profileDetails}>
            <Text style={styles.profileName}>{account?.full_name || "Bahria Student"}</Text>
            <Text style={styles.profileEnrollment}>{account?.enrollment || "No Enrollment Connected"}</Text>
            <Text style={styles.profileCampus}>{account?.campus_name || "Campus Unspecified"}</Text>
            {account?.program ? (
              <Text style={styles.profileProgram}>{account.program}</Text>
            ) : null}
          </View>
        </View>

        {/* Section: Home Screen Sections Customization */}
        <Text style={styles.sectionHeader}>Home Screen Sections</Text>
        <View style={styles.card}>
          <Text style={styles.testNoteText}>
            Choose which academic summary sections appear on your Home dashboard:
          </Text>

          <View style={styles.switchRow}>
            <View style={styles.labelGroup}>
              <Text style={styles.itemTitle}>Pending Assignments</Text>
              <Text style={styles.itemSubtitle}>Upcoming coursework with active deadlines</Text>
            </View>
            <Switch
              value={showPendingHome}
              onValueChange={(val) => updateHomeScreenPref("showPending", val)}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.labelGroup}>
              <Text style={styles.itemTitle}>Missed Assignments</Text>
              <Text style={styles.itemSubtitle}>Coursework past deadline that was not submitted</Text>
            </View>
            <Switch
              value={showMissedHome}
              onValueChange={(val) => updateHomeScreenPref("showMissed", val)}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.labelGroup}>
              <Text style={styles.itemTitle}>Low Attendance Subjects</Text>
              <Text style={styles.itemSubtitle}>Subjects below 75% or with warning/critical alerts</Text>
            </View>
            <Switch
              value={showLowAttendanceHome}
              onValueChange={(val) => updateHomeScreenPref("showLowAttendance", val)}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>
        </View>

        {/* Section: Attendance Threshold */}
        <Text style={styles.sectionHeader}>Attendance Assumption</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.labelGroup}>
              <Text style={styles.itemTitle}>Minimum Required Attendance</Text>
              <Text style={styles.itemSubtitle}>
                Default starting assumption is 75%. Safe misses recalculate based on this number.
              </Text>
            </View>
            <View style={styles.thresholdInputBox}>
              <TextInput
                style={styles.thresholdInput}
                keyboardType="numeric"
                value={threshold}
                onChangeText={setThreshold}
              />
              <Text style={styles.thresholdPct}>%</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.savePrefBtn} onPress={savePreferences}>
            <Text style={styles.savePrefBtnText}>Apply Threshold</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Security & Monitoring */}
        <Text style={styles.sectionHeader}>Credential & Monitoring Security</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.labelGroup}>
              <Text style={styles.itemTitle}>Cloud Monitoring Mode</Text>
              <Text style={styles.itemSubtitle}>
                {cloudMonitoring
                  ? "Active: Credentials encrypted with AES-256-GCM for 24/7 background sync."
                  : "Inactive (Local-Only): Password stored only on your phone's Keystore."}
              </Text>
            </View>
            <Switch
              value={cloudMonitoring}
              onValueChange={handleToggleCloud}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>
        </View>

        {/* Section: Notification Reminders */}
        <Text style={styles.sectionHeader}>Notification Preferences</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.itemTitle}>New Assignments</Text>
            <Switch
              value={assignAlerts}
              onValueChange={(val) => {
                setAssignAlerts(val);
                savePreferences();
              }}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.itemTitle}>Attendance Updates & Absences</Text>
            <Switch
              value={attendanceAlerts}
              onValueChange={(val) => {
                setAttendanceAlerts(val);
                savePreferences();
              }}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.itemTitle}>New Lecture Materials</Text>
            <Switch
              value={materialsAlerts}
              onValueChange={(val) => {
                setMaterialsAlerts(val);
                savePreferences();
              }}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.subSectionTitle}>Assignment Deadline Reminders</Text>

          <View style={styles.switchRow}>
            <Text style={styles.itemTitle}>48 Hours Before Due Date</Text>
            <Switch
              value={remind48h}
              onValueChange={(val) => {
                setRemind48h(val);
                savePreferences();
              }}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.itemTitle}>24 Hours Before Due Date</Text>
            <Switch
              value={remind24h}
              onValueChange={(val) => {
                setRemind24h(val);
                savePreferences();
              }}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.itemTitle}>3 Hours Final Reminder</Text>
            <Switch
              value={remind3h}
              onValueChange={(val) => {
                setRemind3h(val);
                savePreferences();
              }}
              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            />
          </View>

          <View style={styles.divider} />
          <Text style={styles.subSectionTitle}>Notification Diagnostics</Text>
          <Text style={styles.testNoteText}>
            Test your device notification banner and sound integration:
          </Text>

          <TouchableOpacity
            style={styles.testPushBtn}
            onPress={() => handleTestNotification("general")}
          >
            <Bell size={16} color="#fff" />
            <Text style={styles.testPushText}>Generate Test Notification</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testPushBtnSecondary}
            onPress={() => handleTestNotification("deadline")}
          >
            <Send size={15} color={colors.primary} />
            <Text style={styles.testPushTextSecondary}>Test Assignment Deadline Alert</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Download Directory Configuration */}
        <Text style={styles.sectionHeader}>Download Storage Location</Text>
        <View style={styles.card}>
          <Text style={styles.itemTitle}>Lecture & Document Save Path:</Text>
          <Text style={styles.testNoteText}>
            Lecture slides and coursework attachments will be saved to this folder:
          </Text>
          <TextInput
            style={styles.serverInput}
            value={downloadPath}
            onChangeText={setDownloadPath}
            autoCapitalize="none"
            placeholder={DEFAULT_DOWNLOAD_DIR}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              style={[styles.saveServerBtn, { flex: 1 }]}
              onPress={handleSaveDownloadPath}
            >
              <Text style={styles.saveServerBtnText}>Save Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.resetBtn, { flex: 1 }]}
              onPress={handleResetDownloadPath}
            >
              <Text style={styles.resetBtnText}>Reset to Default</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: In-App Updates & Version */}
        <Text style={styles.sectionHeader}>App Updates & Release</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.labelGroup}>
              <Text style={styles.itemTitle}>CampusFlow Version</Text>
              <Text style={styles.itemSubtitle}>
                Installed: v{getCurrentAppVersion()} • Dynamic In-App Updates Enabled
              </Text>
            </View>
            <TouchableOpacity
              style={styles.checkUpdateBtn}
              onPress={handleManualCheckUpdate}
              disabled={checkingUpdate}
              activeOpacity={0.8}
            >
              {checkingUpdate ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Sparkles size={14} color="#fff" />
              )}
              <Text style={styles.checkUpdateBtnText}>
                {checkingUpdate ? "Checking..." : "Check for Updates"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Server URL Configuration */}
        <Text style={styles.sectionHeader}>Development & Server IP</Text>
        <View style={styles.card}>
          <Text style={styles.itemTitle}>Backend API URL (Wi-Fi LAN IP):</Text>
          <TextInput
            style={styles.serverInput}
            value={serverUrlInput}
            onChangeText={setServerUrlInput}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.saveServerBtn} onPress={handleSaveServerUrl}>
            <Text style={styles.saveServerBtnText}>Update Server Address</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Account Actions */}
        <View style={styles.dangerSection}>
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={() => {
              Alert.alert(
                "Disconnect Bahria University Account?",
                "This will wipe all cached courses, attendance, and assignments from the device.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Disconnect", style: "destructive", onPress: disconnectLMS },
                ]
              );
            }}
          >
            <Trash2 size={16} color={colors.statusDanger} />
            <Text style={styles.disconnectText}>Disconnect Bahria Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              Alert.alert("Log Out", "Are you sure you want to log out of CampusFlow?", [
                { text: "Cancel", style: "cancel" },
                { text: "Log Out", style: "destructive", onPress: logout },
              ]);
            }}
          >
            <LogOut size={16} color={colors.textSecondary} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNotice}>
          CampusFlow is an independent unofficial student companion and is not affiliated with Bahria University.
        </Text>
      </ScrollView>

      {/* Manual In-App Update Modal */}
      <InAppUpdateModal
        visible={showUpdateModal}
        updateInfo={updateInfo}
        onDismiss={() => setShowUpdateModal(false)}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  profileEnrollment: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 1,
  },
  profileCampus: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  profileProgram: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelGroup: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  thresholdInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  thresholdInput: {
    width: 36,
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
    paddingVertical: 6,
  },
  thresholdPct: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  savePrefBtn: {
    backgroundColor: colors.primarySubtle,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  savePrefBtnText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceBorderLight,
    marginVertical: 10,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  testNoteText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
    lineHeight: 16,
  },
  testPushBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  testPushText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  testPushBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: colors.primarySubtle,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  testPushTextSecondary: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  serverInput: {
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSecondary,
    marginVertical: 8,
  },
  saveServerBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  saveServerBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  resetBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  resetBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  dangerSection: {
    marginTop: 12,
    gap: 10,
  },
  disconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.statusDangerBg,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.statusDangerBorder,
  },
  disconnectText: {
    color: colors.statusDanger,
    fontSize: 14,
    fontWeight: "700",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  logoutText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  checkUpdateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  checkUpdateBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  footerNotice: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 16,
  },
});
