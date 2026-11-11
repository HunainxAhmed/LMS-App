import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from "react-native";
import { colors } from "../theme/colors";
import { RefreshCw, CheckCircle2, ShieldCheck } from "lucide-react-native";

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
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Pulse animation for active sync dot
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (isSyncing) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.35,
            duration: 650,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [isSyncing, pulseAnim]);

  // Step-driven progress bar calculation
  useEffect(() => {
    if (!isSyncing) {
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
      return;
    }

    const s = (syncStep || "").toLowerCase();
    let target = 20;
    if (s.includes("auth") || s.includes("login")) target = 35;
    else if (s.includes("attend")) target = 55;
    else if (s.includes("course") && !s.includes("material")) target = 70;
    else if (s.includes("assign") || s.includes("material")) target = 85;
    else if (s.includes("success") || s.includes("up to date") || s.includes("complet")) target = 100;

    Animated.timing(progressAnim, {
      toValue: target,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [isSyncing, syncStep, progressAnim]);

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

  const isCompleted = (syncStep || "").includes("successfully") || (syncStep || "").includes("✅");

  return (
    <View style={styles.bannerWrapper}>
      <View style={styles.banner}>
        <View style={styles.left}>
          {isSyncing ? (
            <Animated.View style={[styles.pulseContainer, { opacity: pulseAnim }]}>
              <View style={styles.pulseDotOuter}>
                <View style={styles.pulseDotInner} />
              </View>
              <Text style={styles.cloudTextSyncing}>Syncing Live</Text>
            </Animated.View>
          ) : isCompleted ? (
            <View style={styles.pulseContainer}>
              <CheckCircle2 size={13} color={colors.primary} />
              <Text style={styles.cloudText}>Updated</Text>
            </View>
          ) : (
            <View style={styles.pulseContainer}>
              <View style={styles.pulseDotOuter}>
                <View style={styles.pulseDotInner} />
              </View>
              <Text style={styles.cloudText}>Render 24/7 Cloud</Text>
            </View>
          )}

          <Text style={styles.dotSeparator}>•</Text>

          <Text style={[styles.timeText, isSyncing && styles.timeTextSyncing]} numberOfLines={1}>
            {isSyncing ? syncStep || "Connecting to Bahria portal..." : formatTime(lastSyncedAt)}
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

      {/* Progress Bar Line */}
      {isSyncing && (
        <View style={styles.progressBarTrack}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrapper: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  banner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
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
  cloudTextSyncing: {
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
    flex: 1,
  },
  timeTextSyncing: {
    color: colors.primary,
    fontWeight: "600",
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
    opacity: 0.7,
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
  progressBarTrack: {
    height: 2.5,
    backgroundColor: colors.primaryLight,
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 1.5,
  },
});
