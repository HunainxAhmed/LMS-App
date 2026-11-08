import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { colors } from "../theme/colors";
import {
  UpdateInfo,
  DownloadProgress,
  applyOtaUpdate,
  downloadAndInstallApk,
} from "../services/updater";
import {
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react-native";

interface InAppUpdateModalProps {
  visible: boolean;
  updateInfo: UpdateInfo | null;
  onDismiss: () => void;
}

export const InAppUpdateModal: React.FC<InAppUpdateModalProps> = ({
  visible,
  updateInfo,
  onDismiss,
}) => {
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    progressPercent: 0,
    bytesWritten: 0,
    totalBytes: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!visible || !updateInfo || !updateInfo.isAvailable) {
    return null;
  }

  const formatMb = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1);
  };

  const handleStartUpdate = async () => {
    setIsUpdating(true);
    setErrorMessage(null);

    try {
      if (updateInfo.type === "OTA") {
        await applyOtaUpdate((progress) => {
          setDownloadProgress(progress);
        });
      } else if (updateInfo.type === "APK" && updateInfo.downloadUrl) {
        await downloadAndInstallApk(updateInfo.downloadUrl, (progress) => {
          setDownloadProgress(progress);
        });
      }
    } catch (err: any) {
      console.error("Update failed:", err);
      setErrorMessage(err.message || "Failed to download update. Please try again.");
      setIsUpdating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={updateInfo.isMandatory ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Close button if optional */}
          {!updateInfo.isMandatory && !isUpdating && (
            <TouchableOpacity style={styles.closeBtn} onPress={onDismiss}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Header Icon */}
          <View style={styles.iconCircle}>
            <Sparkles size={28} color={colors.primary} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Update Available! 🚀</Text>
          <Text style={styles.subtitle}>
            A newer, faster version of CampusFlow is ready to install.
          </Text>

          {/* Version Transition Pill */}
          <View style={styles.versionRow}>
            <View style={styles.versionPillOld}>
              <Text style={styles.versionPillOldText}>v{updateInfo.currentVersion}</Text>
            </View>
            <ArrowRight size={14} color={colors.textMuted} />
            <View style={styles.versionPillNew}>
              <Text style={styles.versionPillNewText}>v{updateInfo.latestVersion}</Text>
            </View>
          </View>

          {/* Release Notes */}
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>WHAT'S NEW:</Text>
            <ScrollView style={styles.notesScroll} nestedScrollEnabled>
              {updateInfo.releaseNotes.map((note, idx) => (
                <View key={idx} style={styles.noteItem}>
                  <CheckCircle2 size={13} color={colors.primary} style={{ marginTop: 2 }} />
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Error Message */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <AlertCircle size={14} color={colors.statusDanger} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Progress or Action Area */}
          {isUpdating ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  {updateInfo.type === "OTA"
                    ? "Applying update and restarting..."
                    : `Downloading update... ${downloadProgress.progressPercent}%`}
                </Text>
                {downloadProgress.totalBytes > 0 && updateInfo.type !== "OTA" && (
                  <Text style={styles.progressBytes}>
                    {formatMb(downloadProgress.bytesWritten)} /{" "}
                    {formatMb(downloadProgress.totalBytes)} MB
                  </Text>
                )}
              </View>

              {/* Progress Bar Track */}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${downloadProgress.progressPercent}%` },
                  ]}
                />
              </View>

              <Text style={styles.progressNote}>
                {downloadProgress.progressPercent >= 100
                  ? "Opening installer..."
                  : "Please keep the app open while downloading."}
              </Text>
            </View>
          ) : (
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={styles.updateButton}
                onPress={handleStartUpdate}
                activeOpacity={0.8}
              >
                <Download size={16} color="#fff" />
                <Text style={styles.updateButtonText}>
                  {updateInfo.type === "OTA" ? "Update & Restart Now" : "Download & Install Update"}
                </Text>
              </TouchableOpacity>

              {!updateInfo.isMandatory && (
                <TouchableOpacity
                  style={styles.laterButton}
                  onPress={onDismiss}
                  activeOpacity={0.7}
                >
                  <Text style={styles.laterButtonText}>Remind Me Later</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 6,
    zIndex: 10,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 17,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
  },
  versionPillOld: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionPillOldText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  versionPillNew: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  versionPillNewText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "700",
  },
  notesBox: {
    width: "100%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    maxHeight: 140,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  notesScroll: {
    maxHeight: 110,
  },
  noteItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 5,
  },
  noteText: {
    fontSize: 11,
    color: colors.textPrimary,
    lineHeight: 16,
    flex: 1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    width: "100%",
  },
  errorText: {
    fontSize: 11,
    color: colors.statusDanger,
    flex: 1,
  },
  progressContainer: {
    width: "100%",
    marginTop: 14,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  progressBytes: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressNote: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
  buttonsContainer: {
    width: "100%",
    marginTop: 14,
    gap: 8,
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  updateButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  laterButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  laterButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
});
