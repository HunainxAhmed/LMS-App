import { Platform, Linking } from "react-native";
import * as Updates from "expo-updates";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";
import { api } from "./api";

export interface UpdateInfo {
  isAvailable: boolean;
  type: "OTA" | "APK" | "NONE";
  latestVersion: string;
  currentVersion: string;
  releaseNotes: string[];
  downloadUrl?: string;
  fileSizeBytes?: number;
  isMandatory?: boolean;
}

export interface DownloadProgress {
  progressPercent: number; // 0 to 100
  bytesWritten: number;
  totalBytes: number;
}

/**
 * Returns current installed app version from Expo constants / package
 */
export function getCurrentAppVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    "1.0.0"
  );
}

/**
 * Check if a newer version or OTA bundle is available
 */
export async function checkForAppUpdate(): Promise<UpdateInfo> {
  const currentVer = getCurrentAppVersion();

  // 1. Check Expo Updates (OTA code push) if enabled in standalone runtime
  if (Updates.isEnabled && !__DEV__) {
    try {
      const otaCheck = await Updates.checkForUpdateAsync();
      if (otaCheck.isAvailable) {
        return {
          isAvailable: true,
          type: "OTA",
          latestVersion: `${currentVer} (Hotfix)`,
          currentVersion: currentVer,
          releaseNotes: [
            "Hotfix update with latest UI enhancements and bugfixes.",
            "App will restart immediately after download.",
          ],
        };
      }
    } catch (e) {
      console.warn("OTA update check skipped:", e);
    }
  }

  // 2. Check Backend Version Registry
  try {
    const res = await api.checkAppUpdate(currentVer, Platform.OS);
    if (res && res.is_update_available) {
      let apkDownloadUrl = res.download_url;
      if (apkDownloadUrl.startsWith("/")) {
        const base = await api.getLatestApkDownloadUrl();
        apkDownloadUrl = base;
      }

      return {
        isAvailable: true,
        type: "APK",
        latestVersion: res.latest_version,
        currentVersion: res.current_version,
        releaseNotes: res.release_notes || ["General performance improvements."],
        downloadUrl: apkDownloadUrl,
        fileSizeBytes: res.file_size_bytes || 35000000,
        isMandatory: res.is_mandatory,
      };
    }
  } catch (backendErr) {
    console.warn("Backend update check failed:", backendErr);
  }

  return {
    isAvailable: false,
    type: "NONE",
    latestVersion: currentVer,
    currentVersion: currentVer,
    releaseNotes: [],
  };
}

/**
 * Apply Over-The-Air (OTA) update and restart app
 */
export async function applyOtaUpdate(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (onProgress) {
    onProgress({ progressPercent: 25, bytesWritten: 25, totalBytes: 100 });
  }

  await Updates.fetchUpdateAsync();

  if (onProgress) {
    onProgress({ progressPercent: 100, bytesWritten: 100, totalBytes: 100 });
  }

  // Instantly reload into the new JavaScript bundle
  await Updates.reloadAsync();
}

/**
 * Prompt Android to install the downloaded APK file.
 * Handles content URI conversion, proper Android intent flags, and browser fallback.
 */
export async function launchApkInstaller(
  fileUri: string,
  fallbackDownloadUrl?: string
): Promise<void> {
  if (Platform.OS !== "android") {
    if (fallbackDownloadUrl) {
      await Linking.openURL(fallbackDownloadUrl);
    }
    return;
  }

  try {
    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    // 268435457 = FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (0x10000000 / 268435456)
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 268435457,
      type: "application/vnd.android.package-archive",
    });
  } catch (err: any) {
    console.warn("Native package installer launch failed, opening fallback:", err);
    if (fallbackDownloadUrl) {
      await Linking.openURL(fallbackDownloadUrl);
    } else {
      throw err;
    }
  }
}

/**
 * Download APK file with real-time progress bar and launch package installer
 */
export async function downloadAndInstallApk(
  downloadUrl: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<{ success: boolean; localUri: string }> {
  // Graceful browser handling when testing in web preview
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      onProgress({ progressPercent: 100, bytesWritten: 100, totalBytes: 100 });
      window.open(downloadUrl, "_blank");
    }
    return { success: true, localUri: downloadUrl };
  }

  if (Platform.OS !== "android") {
    throw new Error("Direct APK installation is supported on Android devices.");
  }

  const targetDir = `${FileSystem.cacheDirectory}apk_updates/`;
  await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true }).catch(() => {});
  const localFileUri = `${targetDir}campusflow_update_${Date.now()}.apk`;

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    localFileUri,
    {},
    (downloadProgress) => {
      const written = downloadProgress.totalBytesWritten;
      const total = downloadProgress.totalBytesExpectedToWrite;
      const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
      onProgress({
        progressPercent: pct,
        bytesWritten: written,
        totalBytes: total > 0 ? total : 33400000,
      });
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || !result.uri) {
    throw new Error("Failed to download update package.");
  }

  // 100% completion notification
  onProgress({
    progressPercent: 100,
    bytesWritten: 33400000,
    totalBytes: 33400000,
  });

  // Attempt to launch installer
  try {
    await launchApkInstaller(result.uri, downloadUrl);
  } catch (launchErr) {
    console.warn("Auto-launch failed, user can tap Install button:", launchErr);
  }

  return { success: true, localUri: result.uri };
}
