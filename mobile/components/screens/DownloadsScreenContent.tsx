import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "../../theme/colors";
import { getDownloadDirectory } from "../../services/storage";
import { SwipeableDownloadCard } from "../SwipeableDownloadCard";
import { useTabStore } from "../../stores/tabStore";
import {
  DownloadedItem,
  syncAndGetDownloadedFiles,
  openDownloadedFile,
  shareDownloadedFile,
  deleteDownloadedFile,
  clearAllDownloadedFiles,
  formatBytes,
} from "../../services/downloadsRegistry";
import { useDownloadQueueStore } from "../../stores/downloadQueueStore";
import {
  FolderDown,
  FileText,
  FolderArchive,
  Search,
  X,
  Share2,
  Trash2,
  FileCode,
  HardDrive,
  ExternalLink,
  CheckCircle2,
  Clock,
  Layers,
  Settings,
  ArrowRight,
  BookOpen,
  CheckSquare,
} from "lucide-react-native";

export const DownloadsScreenContent: React.FC = () => {
  const router = useRouter();
  const activeDownload = useDownloadQueueStore();
  const [items, setItems] = useState<DownloadedItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [storagePath, setStoragePath] = useState<string>("");

  // Select and Hold Multi-Select State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);

  useEffect(() => {
    useTabStore.getState().setPagerScrollEnabled(!isMultiSelectMode);
    return () => {
      useTabStore.getState().setPagerScrollEnabled(true);
    };
  }, [isMultiSelectMode]);

  const loadDownloads = useCallback(async () => {
    try {
      const path = await getDownloadDirectory();
      setStoragePath(path);
      const list = await syncAndGetDownloadedFiles();
      setItems(list);
    } catch (e) {
      console.warn("Error loading downloads:", e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  // Reactive auto-reload: When active background download writes a new file, refresh the list immediately!
  useEffect(() => {
    if (activeDownload.currentIndex > 0 || activeDownload.isComplete) {
      loadDownloads();
    }
  }, [activeDownload.currentIndex, activeDownload.isComplete, loadDownloads]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadDownloads();
  };

  const handleOpenFile = async (item: DownloadedItem) => {
    await openDownloadedFile(item);
  };

  const handleShareFile = async (item: DownloadedItem) => {
    await shareDownloadedFile(item);
  };

  const handleDeleteFile = (item: DownloadedItem) => {
    Alert.alert(
      "Delete File?",
      `Are you sure you want to remove "${item.fileName}" from your device?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteDownloadedFile(item.id, item.fileUri);
            setItems((prev) => prev.filter((x) => x.id !== item.id));
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
          },
        },
      ]
    );
  };

  // Multi-select handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleLongPress = (id: string) => {
    setIsMultiSelectMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleSelectAll = (filteredCount: number, filteredItems: DownloadedItem[]) => {
    if (selectedIds.size === filteredCount) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      "Delete Selected Files?",
      `Are you sure you want to remove ${count} file${count === 1 ? "" : "s"} (${formatBytes(selectedTotalBytes)}) from your device storage?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Delete (${count})`,
          style: "destructive",
          onPress: async () => {
            const toDelete = items.filter((x) => selectedIds.has(x.id));
            setItems((prev) => prev.filter((x) => !selectedIds.has(x.id)));
            setSelectedIds(new Set());
            setIsMultiSelectMode(false);

            for (const item of toDelete) {
              await deleteDownloadedFile(item.id, item.fileUri).catch(() => {});
            }
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    Alert.alert(
      "Clear All Downloads?",
      "This will remove all downloaded lecture slides, assignment documents, and archives from your device storage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearAllDownloadedFiles();
            setItems([]);
          },
        },
      ]
    );
  };

  // Filtered files
  const filteredItems = useMemo(() => {
    let list = items;

    if (activeCategory !== "all") {
      list = list.filter((i) => i.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.fileName.toLowerCase().includes(q) ||
          (i.courseName && i.courseName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [items, activeCategory, searchQuery]);

  // Aggregate Stats
  const totalBytes = useMemo(() => {
    return items.reduce((acc, curr) => acc + (curr.fileSize || 0), 0);
  }, [items]);

  const selectedTotalBytes = useMemo(() => {
    return items
      .filter((it) => selectedIds.has(it.id))
      .reduce((sum, it) => sum + (it.fileSize || 0), 0);
  }, [items, selectedIds]);

  const renderFileIcon = (item: DownloadedItem) => {
    const ext = item.fileName.split(".").pop()?.toLowerCase();
    if (ext === "zip" || item.category === "archive") {
      return (
        <View style={[styles.iconWrap, { backgroundColor: "#EEF2FF" }]}>
          <FolderArchive size={22} color="#4F46E5" />
        </View>
      );
    }
    if (ext === "pdf" || item.category === "lecture") {
      return (
        <View style={[styles.iconWrap, { backgroundColor: "#FEF2F2" }]}>
          <FileText size={22} color="#DC2626" />
        </View>
      );
    }
    if (item.category === "submission") {
      return (
        <View style={[styles.iconWrap, { backgroundColor: "#ECFDF5" }]}>
          <CheckCircle2 size={22} color="#059669" />
        </View>
      );
    }
    if (item.category === "assignment") {
      return (
        <View style={[styles.iconWrap, { backgroundColor: "#FFFBEB" }]}>
          <Clock size={22} color="#D97706" />
        </View>
      );
    }
    return (
      <View style={[styles.iconWrap, { backgroundColor: "#F3F4F6" }]}>
        <FileCode size={22} color="#4B5563" />
      </View>
    );
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Saved";
    }
  };

  const getCategoryBadgeLabel = (cat: string) => {
    switch (cat) {
      case "lecture":
        return "Lecture";
      case "assignment":
        return "Assignment";
      case "submission":
        return "My Submission";
      case "archive":
        return "ZIP Archive";
      default:
        return "Document";
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.headerTitle}>
            {isMultiSelectMode ? `${selectedIds.size} Selected` : "Downloads"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isMultiSelectMode
              ? "Tap files to toggle selection • Tap Delete below"
              : "Offline files & lecture slides saved on this device"}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          {isMultiSelectMode ? (
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => {
                setSelectedIds(new Set());
                setIsMultiSelectMode(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          ) : items.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TouchableOpacity
                style={styles.selectHeaderBtn}
                onPress={() => setIsMultiSelectMode(true)}
                activeOpacity={0.7}
              >
                <CheckSquare size={14} color={colors.primary} />
                <Text style={styles.selectHeaderBtnText}>Select</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearAll}
                activeOpacity={0.7}
              >
                <Trash2 size={15} color={colors.statusDanger} />
                <Text style={styles.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Active Background Download Card */}
        {activeDownload.isActive && (
          <View style={styles.activeDownloadCard}>
            <View style={styles.activeDownloadHeader}>
              <View style={styles.activeDownloadIconCircle}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.activeDownloadTopRow}>
                  <View style={styles.activeDownloadBadge}>
                    <Text style={styles.activeDownloadBadgeText}>DOWNLOADING IN BACKGROUND</Text>
                  </View>
                  <Text style={styles.activeDownloadPercent}>{activeDownload.percent}%</Text>
                </View>
                <Text style={styles.activeDownloadTitle} numberOfLines={1}>
                  {activeDownload.courseTitle}
                </Text>
                <Text style={styles.activeDownloadSubtitle} numberOfLines={1}>
                  File {activeDownload.currentIndex} of {activeDownload.totalCount}: {activeDownload.currentFileName}
                </Text>
              </View>
            </View>

            <View style={styles.activeProgressBarTrack}>
              <View style={[styles.activeProgressBarFill, { width: `${activeDownload.percent}%` }]} />
            </View>

            <View style={styles.activeDownloadFooter}>
              <Text style={styles.activeDownloadHint}>
                ⚡ Downloading sequentially. Progress is also tracked in the notification shade.
              </Text>
            </View>
          </View>
        )}

        {/* Storage Summary Card */}
        <View style={styles.storageCard}>
          <View style={styles.storageRow}>
            <View style={styles.storageIconCircle}>
              <HardDrive size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.storageLabel}>STORAGE USAGE</Text>
              <Text style={styles.storageValue}>
                {formatBytes(totalBytes)} • {items.length} file{items.length === 1 ? "" : "s"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.settingsLinkBtn}
              onPress={() => router.push("/settings" as any)}
              activeOpacity={0.7}
            >
              <Settings size={14} color={colors.textSecondary} />
              <Text style={styles.settingsLinkText}>Path</Text>
            </TouchableOpacity>
          </View>

          {storagePath ? (
            <View style={styles.pathBox}>
              <Text style={styles.pathLabel}>Saved at:</Text>
              <Text style={styles.pathValue} numberOfLines={1}>
                {storagePath}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Search Bar */}
        {items.length > 2 && (
          <View style={styles.searchBar}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search downloaded files or subjects..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Category Filter Chips */}
        {items.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {[
              { id: "all", label: "All Files" },
              { id: "lecture", label: "Lectures" },
              { id: "assignment", label: "Assignments" },
              { id: "submission", label: "Submissions" },
              { id: "archive", label: "ZIP Archives" },
            ].map((chip) => {
              const active = activeCategory === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setActiveCategory(chip.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Main List */}
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Reading downloaded files...</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <FolderDown size={44} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Downloads Yet</Text>
            <Text style={styles.emptySubtitle}>
              Whenever you download lecture slides, assignment documents, or course ZIPs, they will appear here so you can tap to open and review them instantly offline.
            </Text>
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => router.push("/(tabs)/lectures" as any)}
              activeOpacity={0.8}
            >
              <BookOpen size={16} color="#fff" />
              <Text style={styles.browseBtnText}>Browse Lecture Notes</Text>
              <ArrowRight size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Search size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Matching Files</Text>
            <Text style={styles.emptySubtitle}>
              No downloaded files match your search criteria.
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeading}>
                {filteredItems.length} SAVED DOCUMENT{filteredItems.length === 1 ? "" : "S"}
              </Text>
              {!isMultiSelectMode && (
                <Text style={styles.swipeHintText}>Hold to select • Swipe left to delete</Text>
              )}
            </View>
            {filteredItems.map((item) => (
              <SwipeableDownloadCard
                key={item.id}
                item={item}
                isMultiSelectMode={isMultiSelectMode}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={() => handleToggleSelect(item.id)}
                onLongPress={() => handleLongPress(item.id)}
                onPress={() => handleOpenFile(item)}
                onDelete={() => handleDeleteFile(item)}
                onShare={() => handleShareFile(item)}
                renderFileIcon={renderFileIcon}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating Batch Selection Bar */}
      {isMultiSelectMode && (
        <View style={styles.batchActionBar}>
          <View style={styles.batchBarInfo}>
            <Text style={styles.batchBarCount}>{selectedIds.size} Selected</Text>
            <Text style={styles.batchBarSize}>{formatBytes(selectedTotalBytes)}</Text>
          </View>
          <View style={styles.batchBarButtons}>
            <TouchableOpacity
              style={styles.batchSelectAllBtn}
              onPress={() => handleSelectAll(filteredItems.length, filteredItems)}
              activeOpacity={0.7}
            >
              <Text style={styles.batchSelectAllBtnText}>
                {selectedIds.size === filteredItems.length ? "Deselect All" : "Select All"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.batchDeleteBtn}
              onPress={handleDeleteSelected}
              activeOpacity={0.8}
            >
              <Trash2 size={15} color="#ffffff" />
              <Text style={styles.batchDeleteBtnText}>Delete ({selectedIds.size})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    gap: 4,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.statusDanger,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  activeDownloadCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
    marginBottom: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  activeDownloadHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  activeDownloadIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySubtle,
    justifyContent: "center",
    alignItems: "center",
  },
  activeDownloadTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  activeDownloadBadge: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeDownloadBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  activeDownloadPercent: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  activeDownloadTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  activeDownloadSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activeProgressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    marginBottom: 8,
  },
  activeProgressBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  activeDownloadFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  activeDownloadHint: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
  storageCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 14,
  },
  storageRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  storageIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  storageLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  storageValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  settingsLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  settingsLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  pathBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    flexDirection: "row",
    alignItems: "center",
  },
  pathLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
    marginRight: 6,
  },
  pathValue: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    marginLeft: 8,
  },
  chipsRow: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 10,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginTop: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  browseBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  listContainer: {
    marginTop: 2,
  },
  listHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingLeft: 2,
  },
  fileCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
    marginRight: 8,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 18,
  },
  fileCourse: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    flexWrap: "wrap",
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  fileMetaDot: {
    fontSize: 11,
    color: colors.textMuted,
    marginHorizontal: 5,
  },
  fileSizeText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },
  fileDateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  selectHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(4, 120, 87, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.2)",
  },
  selectHeaderBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  batchCancelBtn: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  headerCancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  swipeHintText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "500",
  },
  batchActionBar: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  batchBarInfo: {
    flexDirection: "column",
  },
  batchBarCount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  batchBarSize: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 1,
  },
  batchBarButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  batchSelectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#1e293b",
  },
  batchSelectAllBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#cbd5e1",
  },
  batchDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#dc2626",
  },
  batchDeleteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
});
