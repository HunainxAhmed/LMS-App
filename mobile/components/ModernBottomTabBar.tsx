import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { colors } from "../theme/colors";
import { useTabStore } from "../stores/tabStore";
import {
  Home,
  BarChart3,
  Clock,
  BookOpen,
  FolderDown,
  Award,
} from "lucide-react-native";

export const TAB_ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "attendance", label: "Attendance", icon: BarChart3 },
  { id: "assignments", label: "Assignments", icon: Clock },
  { id: "lectures", label: "Lectures", icon: BookOpen },
  { id: "downloads", label: "Downloads", icon: FolderDown },
  { id: "results", label: "Results", icon: Award },
];

export const ModernBottomTabBar: React.FC = () => {
  const { activeTabIndex, scrollToTab } = useTabStore();

  return (
    <View style={styles.tabBar}>
      {TAB_ITEMS.map((item, index) => {
        const IconComponent = item.icon;
        const isActive = activeTabIndex === index;

        return (
          <TouchableOpacity
            key={item.id}
            style={styles.tabButton}
            onPress={() => scrollToTab(index)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <View style={[styles.iconPill, isActive && styles.iconPillActive]}>
              <IconComponent
                size={isActive ? 20 : 18}
                color={isActive ? colors.primary : colors.textMuted}
                strokeWidth={isActive ? 2.4 : 1.8}
              />
            </View>
            <Text
              style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 23, 42, 0.08)",
    height: Platform.OS === "ios" ? 82 : 68,
    paddingBottom: Platform.OS === "ios" ? 22 : 8,
    paddingTop: 6,
    paddingHorizontal: 4,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPillActive: {
    backgroundColor: "rgba(4, 120, 87, 0.12)",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: "800",
  },
});
