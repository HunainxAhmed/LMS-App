import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform, Alert } from "react-native";
import { getSQLiteDb } from "./offlineDb";
import { getDownloadDirectory } from "./storage";

export interface DownloadedItem {
  id: string;
  fileName: string;
  fileUri: string;
  fileSize?: number; // bytes
  courseName?: string;
  category: "lecture" | "assignment" | "submission" | "archive" | "general";
  mimeType?: string;
  downloadedAt: string; // ISO string
}

const WEB_STORAGE_KEY = "cf_local_downloads_registry";

function getWebDownloads(): DownloadedItem[] {
  if (Platform.OS !== "web" || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WEB_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWebDownloads(items: DownloadedItem[]) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Registers a newly downloaded file into the local registry.
 */
export async function registerDownloadedFile({
  fileName,
  fileUri,
  fileSize,
  courseName,
  category = "lecture",
  mimeType,
}: {
  fileName: string;
  fileUri: string;
  fileSize?: number;
  courseName?: string;
  category?: "lecture" | "assignment" | "submission" | "archive" | "general";
  mimeType?: string;
}): Promise<DownloadedItem> {
  let resolvedSize = fileSize || 0;

  // Compute actual file size on native disk if not provided
  if (Platform.OS !== "web" && (!resolvedSize || resolvedSize <= 0)) {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists && !info.isDirectory) {
        resolvedSize = info.size || 0;
      }
    } catch {}
  }

  const resolvedMime = mimeType || getMimeType(fileName);
  const now = new Date().toISOString();
  const id = `dl_${fileName.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

  const item: DownloadedItem = {
    id,
    fileName,
    fileUri,
    fileSize: resolvedSize,
    courseName: courseName || "Bahria LMS",
    category,
    mimeType: resolvedMime,
    downloadedAt: now,
  };

  if (Platform.OS === "web") {
    const list = getWebDownloads();
    // Replace if exists by filename, or prepend
    const filtered = list.filter((x) => x.fileName !== fileName);
    filtered.unshift(item);
    saveWebDownloads(filtered);
    return item;
  }

  try {
    const db = await getSQLiteDb();
    if (db) {
      await db.runAsync(
        `INSERT OR REPLACE INTO local_downloads 
         (id, file_name, file_uri, file_size, course_name, category, mime_type, downloaded_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, fileName, fileUri, resolvedSize, courseName || "Bahria LMS", category, resolvedMime, now]
      );
    }
  } catch (err) {
    console.warn("Could not record downloaded file in SQLite:", err);
  }

  return item;
}

/**
 * Loads all downloaded files from SQLite and scans the physical storage directory
 * to ensure all present files are displayed and broken entries are purged.
 */
export async function syncAndGetDownloadedFiles(): Promise<DownloadedItem[]> {
  if (Platform.OS === "web") {
    return getWebDownloads();
  }

  try {
    const db = await getSQLiteDb();
    if (!db) return [];

    const rows: any[] = await db.getAllAsync(
      "SELECT id, file_name, file_uri, file_size, course_name, category, mime_type, downloaded_at FROM local_downloads ORDER BY downloaded_at DESC"
    );

    const items: DownloadedItem[] = [];
    const missingIds: string[] = [];

    // Verify disk existence
    for (const r of rows) {
      try {
        const info = await FileSystem.getInfoAsync(r.file_uri);
        if (info.exists) {
          items.push({
            id: r.id,
            fileName: r.file_name,
            fileUri: r.file_uri,
            fileSize: info.size || r.file_size || 0,
            courseName: r.course_name,
            category: r.category || "general",
            mimeType: r.mime_type,
            downloadedAt: r.downloaded_at,
          });
        } else {
          missingIds.push(r.id);
        }
      } catch {
        missingIds.push(r.id);
      }
    }

    // Purge missing files from database
    for (const mId of missingIds) {
      await db.runAsync("DELETE FROM local_downloads WHERE id = ?", [mId]);
    }

    // Scan physical download directory for any files downloaded previously or by other tasks
    const targetDir = await getDownloadDirectory();
    try {
      const dirInfo = await FileSystem.getInfoAsync(targetDir);
      if (dirInfo.exists && dirInfo.isDirectory) {
        const diskFiles = await FileSystem.readDirectoryAsync(targetDir);
        const indexedNames = new Set(items.map((i) => i.fileName.toLowerCase()));
        const indexedUris = new Set(items.map((i) => i.fileUri.toLowerCase()));

        for (const fName of diskFiles) {
          const fUri = `${targetDir}${fName}`;
          const cleanName = fName.replace(/^\d{10,14}_/, "");
          const isAlreadyIndexed =
            indexedNames.has(fName.toLowerCase()) ||
            indexedNames.has(cleanName.toLowerCase()) ||
            indexedUris.has(fUri.toLowerCase()) ||
            items.some(
              (i) =>
                i.fileUri.toLowerCase().endsWith("/" + fName.toLowerCase()) ||
                i.fileName.toLowerCase() === cleanName.toLowerCase()
            );

          if (!isAlreadyIndexed) {
            const fInfo = await FileSystem.getInfoAsync(fUri);
            if (fInfo.exists && !fInfo.isDirectory) {
              const size = fInfo.size || 0;
              const isZip = fName.toLowerCase().endsWith(".zip");
              const isAssign = fName.toLowerCase().includes("assign");
              const cat = isZip ? "archive" : isAssign ? "assignment" : "lecture";
              const now = new Date().toISOString();
              const newId = `scanned_${fName.replace(/[^a-zA-Z0-9]/g, "_")}`;

              await db.runAsync(
                `INSERT OR REPLACE INTO local_downloads 
                 (id, file_name, file_uri, file_size, course_name, category, mime_type, downloaded_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [newId, cleanName, fUri, size, "CampusFlow Downloads", cat, getMimeType(cleanName), now]
              );

              items.push({
                id: newId,
                fileName: cleanName,
                fileUri: fUri,
                fileSize: size,
                courseName: "CampusFlow Downloads",
                category: cat,
                mimeType: getMimeType(cleanName),
                downloadedAt: now,
              });
              indexedNames.add(cleanName.toLowerCase());
              indexedUris.add(fUri.toLowerCase());
            }
          }
        }
      }
    } catch {}

    // Deduplicate any overlapping entries in items (e.g. older scanned_ duplicate entries)
    const uniqueItems: DownloadedItem[] = [];
    const seenSignatures = new Set<string>();
    const duplicateIdsToDelete: string[] = [];

    for (const it of items) {
      const baseClean = it.fileName.replace(/^\d{10,14}_/, "").toLowerCase();
      const sig = `${baseClean}_${it.fileSize}`;
      if (seenSignatures.has(sig)) {
        if (it.id.startsWith("scanned_")) {
          duplicateIdsToDelete.push(it.id);
        }
      } else {
        seenSignatures.add(sig);
        uniqueItems.push(it);
      }
    }

    for (const dupId of duplicateIdsToDelete) {
      await db.runAsync("DELETE FROM local_downloads WHERE id = ?", [dupId]).catch(() => {});
    }

    return uniqueItems.sort(
      (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
    );
  } catch (err) {
    console.warn("Error reading downloaded files registry:", err);
    return [];
  }
}

/**
 * Opens a downloaded file using native system viewer (Office viewer, PDF viewer, etc.)
 * On Android: Uses IntentLauncher with Intent.ACTION_VIEW so the file opens directly in WPS Office, PowerPoint, Word, etc.
 * On iOS: Uses document interaction / QuickLook viewer.
 */
export async function openDownloadedFile(item: DownloadedItem) {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.open(item.fileUri, "_blank");
      }
      return;
    }

    let activeUri = item.fileUri;
    let info = await FileSystem.getInfoAsync(activeUri);

    // Fallback: Check active download directory if moved
    if (!info.exists) {
      const currentDir = await getDownloadDirectory();
      const fallbackUri = `${currentDir}${item.fileName}`;
      const fallbackInfo = await FileSystem.getInfoAsync(fallbackUri);
      if (fallbackInfo.exists) {
        activeUri = fallbackUri;
        info = fallbackInfo;
      }
    }

    if (!info.exists) {
      Alert.alert(
        "File Missing",
        `Could not locate "${item.fileName}" on device storage. It may have been moved or deleted.`
      );
      return;
    }

    // Validate file integrity before launching external viewer
    try {
      const headerSnippet = await FileSystem.readAsStringAsync(activeUri, {
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
        Alert.alert(
          "Corrupted File Detected",
          `"${item.fileName}" appears to be an HTML error page rather than a genuine document file. This occurred when downloaded during an expired portal session.\n\nWould you like to delete this corrupted file from your device?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete Corrupted File",
              style: "destructive",
              onPress: async () => {
                await deleteDownloadedFile(item.id, activeUri);
              },
            },
          ]
        );
        return;
      }
    } catch {}

    const mime = item.mimeType || getMimeType(item.fileName);

    // On Android: Use IntentLauncher to directly view/open the file in WPS Office / PowerPoint / PDF Viewer
    if (Platform.OS === "android") {
      const FLAG_GRANT_READ_URI_PERMISSION = 1;
      const FLAG_ACTIVITY_NEW_TASK = 268435456;
      const viewFlags = FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK;

      try {
        const contentUri = await FileSystem.getContentUriAsync(activeUri);

        // 1. First try with explicit MIME type (e.g. application/pdf, pptx, docx)
        try {
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            flags: viewFlags,
            type: mime,
          });
          return;
        } catch (typedErr) {
          console.debug("IntentLauncher typed attempt note:", typedErr);
        }

        // 2. Second try without explicit type so Android resolves via ContentResolver
        try {
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            flags: viewFlags,
          });
          return;
        } catch (untypedErr) {
          console.debug("IntentLauncher untyped attempt note:", untypedErr);
        }

        // 3. Third try with generic type
        try {
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            flags: viewFlags,
            type: "*/*",
          });
          return;
        } catch (genericErr) {
          console.debug("IntentLauncher generic attempt note:", genericErr);
        }
      } catch (androidErr: any) {
        console.warn("getContentUriAsync failed:", androidErr);
      }

      // Seamless fallback: If IntentLauncher couldn't resolve a single default viewer,
      // immediately open the native system chooser via Sharing.shareAsync so the user can open it
      // in Google Drive PDF Viewer, WPS Office, Acrobat, Chrome, etc., without an error dialog!
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(activeUri, {
            mimeType: mime,
            dialogTitle: `Open ${item.fileName}`,
          });
          return;
        }
      } catch (shareErr) {
        console.warn("Sharing fallback failed:", shareErr);
      }

      // If even Sharing is unavailable, notify student
      Alert.alert(
        "Open Document",
        `File is saved on device. Please install a PDF or Office viewer app to view "${item.fileName}".`
      );
      return;
    }

    // iOS and fallback
    if (Platform.OS === "ios") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(activeUri, {
          mimeType: mime,
          dialogTitle: `Open ${item.fileName}`,
          UTI: mime,
        });
      } else {
        Alert.alert("File Saved", `File is stored at:\n${activeUri}`);
      }
      return;
    }
  } catch (err: any) {
    Alert.alert("Cannot Open File", err?.message || "An error occurred while opening the file.");
  }
}

/**
 * Explicitly shares a downloaded file when user clicks the Share icon.
 */
export async function shareDownloadedFile(item: DownloadedItem) {
  try {
    let activeUri = item.fileUri;
    const info = await FileSystem.getInfoAsync(activeUri);
    if (!info.exists) {
      const currentDir = await getDownloadDirectory();
      activeUri = `${currentDir}${item.fileName}`;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(activeUri, {
        mimeType: item.mimeType || getMimeType(item.fileName),
        dialogTitle: `Share ${item.fileName}`,
      });
    } else {
      Alert.alert("Share Unavailable", "Sharing is not supported on this device.");
    }
  } catch (err: any) {
    Alert.alert("Share Error", err?.message || "Could not share file.");
  }
}

/**
 * Deletes a file from physical device storage and removes it from the downloads registry.
 */
export async function deleteDownloadedFile(id: string, fileUri: string) {
  try {
    if (Platform.OS !== "web") {
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch (e) {
        console.warn("Could not delete physical file:", e);
      }
    }

    const db = await getSQLiteDb();
    if (db) {
      await db.runAsync("DELETE FROM local_downloads WHERE id = ?", [id]);
    } else if (Platform.OS === "web") {
      const list = getWebDownloads().filter((f) => f.id !== id);
      saveWebDownloads(list);
    }
  } catch (err) {
    console.warn("Error deleting downloaded file:", err);
  }
}

/**
 * Clears all downloads from physical device storage and registry.
 */
export async function clearAllDownloadedFiles(): Promise<void> {
  const items = await syncAndGetDownloadedFiles();
  for (const it of items) {
    await deleteDownloadedFile(it.id, it.fileUri);
  }
}
