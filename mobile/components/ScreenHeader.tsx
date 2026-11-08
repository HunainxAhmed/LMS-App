import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../theme/colors";
import { Bell, Settings, ShieldCheck } from "lucide-react-native";

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

  // Generate initials (e.g. "HA")
  const names = fullName.trim().split(" ");
  const initials =
    names.length > 1
      ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
      : (fullName.slice(0, 2) || "BU").toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.leftRow}>
        {/* Student Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.studentInfo}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>BAHRIA UNIVERSITY</Text>
            <View style={styles.verifiedDot} />
            <Text style={styles.campusText}>{campusName.replace("Campus", "").trim()}</Text>
          </View>
          <Text style={styles.studentName} numberOfLines={1}>
            {fullName}
          </Text>
          <Text style={styles.enrollmentText}>{enrollment}</Text>
        </View>
      </View>

      <View style={styles.rightActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push("/settings" as any)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Settings"
        >
          <Settings size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push("/notifications" as any)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Notifications"
        >
          <Bell size={18} color={colors.textPrimary} />
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
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  studentInfo: {
    flex: 1,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  verifiedDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
  },
  campusText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  enrollmentText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
    fontFamily: "monospace",
    marginTop: 1,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  counterBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: colors.statusDanger,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  counterText: {
    color: "#ffffff",
    fontSize: 8.5,
    fontWeight: "800",
  },
});
