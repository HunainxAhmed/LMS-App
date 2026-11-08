import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { colors } from "../theme/colors";
import { RefreshCw, CloudCheck, HardDrive } from "lucide-react-native";

interface SyncBannerProps {
  isSyncing: boolean;
  syncStep?: string;
  lastSyncedAt?: string | null;
  cloudMonitoringEnabled?: boolean;
  onSyncPress: () => void;
}

export const SyncBanner: React.FC<SyncBannerProps> = ({
  isSyncing,
  syncStep,
  lastSyncedAt,
  cloudMonitoringEnabled = false,
  onSyncPress,
}) => {
  const formatTime = (iso?: string | null) => {
    if (!iso) return "Never synced";
    try {
      let s = iso;
      if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) {
        s = s + "Z";
      }
      const d = new Date(s);
      if (isNaN(d.getTime())) return "Synced recently";
      return `Synced ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return "Synced recently";
    }
  };

  return (
    <View style={styles.banner}>
      <View style={styles.left}>
        <View style={styles.modeRow}>
          {cloudMonitoringEnabled ? (
            <View style={[styles.modePill, { backgroundColor: colors.primarySubtle }]}>
              <CloudCheck size={12} color={colors.primary} />
              <Text style={styles.modeText}>Cloud 24/7</Text>
            </View>
          ) : (
            <View style={[styles.modePill, { backgroundColor: colors.surfaceSecondary }]}>
              <HardDrive size={12} color={colors.textSecondary} />
              <Text style={[styles.modeText, { color: colors.textSecondary }]}>Device Only</Text>
            </View>
          )}

          <Text style={styles.timeText}>
            {isSyncing ? syncStep || "Synchronizing..." : formatTime(lastSyncedAt)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
        onPress={onSyncPress}
        disabled={isSyncing}
        activeOpacity={0.7}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View style={styles.buttonContent}>
            <RefreshCw size={13} color={colors.primary} />
            <Text style={styles.syncButtonText}>Sync</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  left: {
    flex: 1,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  syncButton: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
});
