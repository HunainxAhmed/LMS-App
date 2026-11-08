import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../theme/colors";
import { Bell, ShieldCheck, Settings } from "lucide-react-native";

interface ScreenHeaderProps {
  fullName?: string;
  enrollment?: string;
  campusName?: string;
  unreadCount?: number;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  fullName = "Student",
  enrollment = "Bahria University",
  campusName = "Karachi Campus",
  unreadCount = 0,
}) => {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.greeting} numberOfLines={1}>
          Welcome, {fullName.split(" ")[0] || "Student"}
        </Text>
        <View style={styles.badgeRow}>
          <Text style={styles.enrollment}>{enrollment}</Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.campus}>{campusName}</Text>
        </View>
      </View>

      <View style={styles.rightActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/settings" as any)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Open Settings"
        >
          <Settings size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => router.push("/notifications" as any)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Open Notifications"
        >
          <Bell size={20} color={colors.textPrimary} />
          {unreadCount > 0 ? (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  enrollment: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  dot: {
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: 5,
  },
  campus: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  counterBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: colors.statusDanger,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  counterText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
});
