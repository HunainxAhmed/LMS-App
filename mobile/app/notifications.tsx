import React, { useState } from "react";
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
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import {
  Bell,
  Clock,
  BookOpen,
  DownloadCloud,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  Trash2,
} from "lucide-react-native";
import { Alert } from "react-native";

export default function NotificationsScreen() {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState("all");

  const {
    data: notifData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["notifications", selectedFilter],
    queryFn: () => api.getNotifications(selectedFilter === "all" ? undefined : selectedFilter),
  });

  const handleMarkAllRead = async () => {
    await api.markNotificationsRead(undefined, true);
    refetch();
  };

  const handleClearRead = () => {
    Alert.alert(
      "Clear Read Notifications",
      "Remove all previously read notifications from your inbox?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await api.clearReadNotifications();
              refetch();
            } catch (e: any) {
              console.warn("Failed to clear read notifications:", e);
            }
          },
        },
      ]
    );
  };

  const handleNotificationPress = async (item: any) => {
    if (!item.is_read) {
      await api.markNotificationsRead([item.id]);
      refetch();
    }
    if (item.deep_link) {
      router.push(item.deep_link as any);
    }
  };

  const getIcon = (category: string) => {
    if (category.includes("ASSIGNMENT")) return <Clock size={18} color={colors.primary} />;
    if (category.includes("ATTENDANCE")) return <BookOpen size={18} color={colors.statusWarning} />;
    if (category.includes("MATERIAL")) return <DownloadCloud size={18} color={colors.statusSafe} />;
    return <Bell size={18} color={colors.primary} />;
  };

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "assignments", label: "Assignments" },
    { key: "attendance", label: "Attendance" },
    { key: "materials", label: "Materials" },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      {/* Top Filter & Actions Row */}
      <View style={styles.topBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filterTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterPill, selectedFilter === tab.key && styles.filterPillActive]}
              onPress={() => setSelectedFilter(tab.key)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  selectedFilter === tab.key && styles.filterPillTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.markReadBtn} onPress={handleMarkAllRead}>
          <CheckCheck size={14} color={colors.primary} />
          <Text style={styles.markReadText}>Mark All Read</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.clearReadBtn} onPress={handleClearRead}>
          <Trash2 size={13} color={colors.textSecondary} />
          <Text style={styles.clearReadText}>Clear Read</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading && !notifData ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : notifData?.notifications && notifData.notifications.length > 0 ? (
          notifData.notifications.map((item: any) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.notificationCard, !item.is_read && styles.unreadCard]}
              onPress={() => handleNotificationPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>{getIcon(item.category)}</View>

              <View style={styles.contentContainer}>
                <View style={styles.headerRow}>
                  <Text style={[styles.title, !item.is_read && styles.unreadTitle]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.is_read && <View style={styles.unreadDot} />}
                </View>

                <Text style={styles.bodyText}>{item.body}</Text>
                <Text style={styles.timeText}>
                  {new Date(item.created_at).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <CheckCircle2 size={36} color={colors.statusSafe} />
            <Text style={styles.emptyTitle}>Inbox Zero</Text>
            <Text style={styles.emptySubtitle}>No notifications found in this category.</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    gap: 8,
  },
  filterScroll: {
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: "#fff",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  markReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  clearReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearReadText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 10,
  },
  notificationCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
    gap: 12,
  },
  unreadCard: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primaryLight,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  unreadTitle: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 6,
  },
  bodyText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
  timeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
