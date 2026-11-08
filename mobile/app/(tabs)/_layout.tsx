import React from "react";
import { Tabs } from "expo-router";
import { colors } from "../../theme/colors";
import { Home, BarChart3, Clock, BookOpen, FolderDown, Award } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.surfaceBorder,
          height: 60,
          paddingBottom: 7,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size - 3} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: "Attendance",
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size - 3} />,
        }}
      />
      <Tabs.Screen
        name="assignments"
        options={{
          title: "Assignments",
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size - 3} />,
        }}
      />
      <Tabs.Screen
        name="lectures"
        options={{
          title: "Lectures",
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size - 3} />,
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color, size }) => <FolderDown color={color} size={size - 3} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: "Results",
          tabBarIcon: ({ color, size }) => <Award color={color} size={size - 3} />,
        }}
      />
    </Tabs>
  );
}
