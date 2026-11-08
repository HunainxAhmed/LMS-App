import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { colors } from "../theme/colors";
import { RefreshCw, Cloud, HardDrive } from "lucide-react-native";

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
  cloudMonitoringEnabled = true,
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
      if (isNaN(d.getTime())) return "Synced just now";
      return `Synced ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return "Synced just now";
    }
  };

  return (
    <View style={styles.banner}>
      <View style={styles.left}>
        <View style={styles.pulseContainer}>
          <View style={styles.pulseDotOuter}>
            <View style={styles.pulseDotInner} />
          </View>
          <Text style={styles.cloudText}>Render 24/7 Cloud</Text>
        </View>

        <Text style={styles.dotSeparator}>•</Text>

        <Text style={styles.timeText} numberOfLines={1}>
          {isSyncing ? syncStep || "Connecting to CMS..." : formatTime(lastSyncedAt)}
        </Text>
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
            <RefreshCw size={12} color={colors.primary} />
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
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  pulseContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pulseDotOuter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  cloudText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: -0.1,
  },
  dotSeparator: {
    fontSize: 11,
    color: colors.textMuted,
    marginHorizontal: 8,
  },
  timeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  syncButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  syncButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
});
