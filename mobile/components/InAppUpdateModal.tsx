import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { colors } from "../theme/colors";
import {
  UpdateInfo,
  DownloadProgress,
  applyOtaUpdate,
  downloadAndInstallApk,
  launchApkInstaller,
} from "../services/updater";
import {
  ArrowUpCircle,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  ExternalLink,
  PackageCheck,
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
  const [isDownloaded, setIsDownloaded] = useState<boolean>(false);
  const [downloadedUri, setDownloadedUri] = useState<string | null>(null);
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
        const res = await downloadAndInstallApk(updateInfo.downloadUrl, (progress) => {
          setDownloadProgress(progress);
        });
        if (res && res.localUri) {
          setDownloadedUri(res.localUri);
          setIsDownloaded(true);
        }
      }
    } catch (err: any) {
      console.error("Update failed:", err);
      setErrorMessage(
        err.message || "Failed to download update package. You can download directly via browser below."
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleInstallDownloaded = async () => {
    if (downloadedUri) {
      await launchApkInstaller(downloadedUri, updateInfo.downloadUrl);
    } else if (updateInfo.downloadUrl) {
      await Linking.openURL(updateInfo.downloadUrl);
    }
  };

  const handleBrowserDownload = async () => {
    if (updateInfo.downloadUrl) {
      await Linking.openURL(updateInfo.downloadUrl);
      onDismiss();
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
          {!updateInfo.isMandatory && (
            <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Header Icon */}
          <View style={[styles.iconCircle, isDownloaded && styles.iconCircleSuccess]}>
            {isDownloaded ? (
              <PackageCheck size={28} color="#059669" />
            ) : (
              <ArrowUpCircle size={28} color={colors.primary} />
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isDownloaded ? "Update Ready to Install! 🚀" : "Update Available! 🚀"}
          </Text>
          <Text style={styles.subtitle}>
            {isDownloaded
              ? "The APK package has been downloaded successfully. Tap below to launch installer."
              : "A newer, faster version of CampusFlow is ready to install."}
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

          {/* Release Notes (Show only before download) */}
          {!isUpdating && !isDownloaded && (
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
          )}

          {/* Error Message */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <AlertCircle size={14} color={colors.statusDanger} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* State 1: Download in Progress */}
          {isUpdating && (
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
          )}

          {/* State 2: Download Complete (Ready to Install) */}
          {isDownloaded && (
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={styles.updateButton}
                onPress={handleInstallDownloaded}
                activeOpacity={0.8}
              >
                <PackageCheck size={16} color="#fff" />
                <Text style={styles.updateButtonText}>Launch Package Installer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleBrowserDownload}
                activeOpacity={0.8}
              >
                <ExternalLink size={15} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Open in Browser / Chrome</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* State 3: Ready to Start Download */}
          {!isUpdating && !isDownloaded && (
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

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleBrowserDownload}
                activeOpacity={0.8}
              >
                <ExternalLink size={15} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Or Download via Browser (Direct APK)</Text>
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
  iconCircleSuccess: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
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
    marginVertical: 14,
  },
  versionPillOld: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.surfaceBorder,
  },
  versionPillOldText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  versionPillNew: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.primaryBorder,
  },
  versionPillNewText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  notesBox: {
    width: "100%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.surfaceBorder,
    marginBottom: 16,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  notesScroll: {
    maxHeight: 120,
  },
  noteItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 12,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff1f2",
    borderRadius: 8,
    padding: 10,
    borderWidth: 0.5,
    borderColor: "#fecdd3",
    marginBottom: 12,
    width: "100%",
  },
  errorText: {
    fontSize: 11.5,
    color: colors.statusDanger,
    flex: 1,
  },
  progressContainer: {
    width: "100%",
    marginTop: 6,
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
    fontWeight: "600",
    color: colors.textMuted,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: colors.surfaceBorder,
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
    marginTop: 8,
  },
  buttonsContainer: {
    width: "100%",
    gap: 8,
    marginTop: 4,
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    width: "100%",
  },
  updateButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#fff",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingVertical: 11,
    borderRadius: 12,
    width: "100%",
  },
  secondaryButtonText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.primary,
  },
  laterButton: {
    paddingVertical: 8,
    alignItems: "center",
  },
  laterButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
