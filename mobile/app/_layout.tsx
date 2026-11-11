import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { queryClient } from "../services/queryClient";
import { useAuthStore } from "../stores/authStore";
import { useAlarmStore } from "../stores/alarmStore";
import { setupNotifications } from "../services/notifications";
import { checkForAppUpdate, UpdateInfo } from "../services/updater";
import { InAppUpdateModal } from "../components/InAppUpdateModal";
import { DownloadToast } from "../components/DownloadToast";

function RootNavigation() {
  const { isAuthenticated, account, isLoading, checkAuth } = useAuthStore();
  const { loadAlarms, snoozeAlarm, cancelAlarm } = useAlarmStore();
  const segments = useSegments();
  const router = useRouter();

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  useEffect(() => {
    checkAuth().catch(() => {});
    setupNotifications().catch(() => {});
    loadAlarms().catch(() => {});

    // Listen to notification interactions (lockscreen / notification shade Snooze & Dismiss)
    let notificationSub: Notifications.Subscription | null = null;
    if (Platform.OS !== "web") {
      notificationSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const actionId = response.actionIdentifier;
        const data = response.notification.request.content.data;
        if (data?.type === "ASSIGNMENT_ALARM" && data?.assignmentId) {
          const assignId = String(data.assignmentId);
          if (actionId === "SNOOZE_24H") {
            await snoozeAlarm(assignId, 24);
          } else if (actionId === "STOP_ALARM") {
            await cancelAlarm(assignId);
          } else {
            router.push("/(tabs)/assignments" as any);
          }
        }
      });
    }

    // Quietly check for dynamic in-app updates in the background
    const updateTimer = setTimeout(() => {
      checkForAppUpdate()
        .then((info) => {
          if (info.isAvailable) {
            setUpdateInfo(info);
            setShowUpdateModal(true);
          }
        })
        .catch(() => {});
    }, 2500);

    return () => {
      clearTimeout(updateTimer);
      if (notificationSub) notificationSub.remove();
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const hasUniversityAccount = Boolean(account);

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login" as any);
    } else if (isAuthenticated && !hasUniversityAccount && !inAuthGroup) {
      // Must connect Bahria University account before entering main tabs
      router.replace("/(auth)/login" as any);
    } else if (isAuthenticated && hasUniversityAccount && inAuthGroup) {
      // Both CampusFlow session and Bahria LMS connection are ready
      router.replace("/(tabs)" as any);
    }
  }, [isAuthenticated, account, isLoading, segments]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: true,
            title: "Notification Center",
            headerBackTitle: "Back",
            headerTintColor: "#0f766e",
            headerTitleStyle: { fontWeight: "700" },
          }}
        />
      </Stack>

      {/* Dynamic In-App Update Modal with Progress Bar */}
      <InAppUpdateModal
        visible={showUpdateModal}
        updateInfo={updateInfo}
        onDismiss={() => setShowUpdateModal(false)}
      />

      {/* Floating Modern Download Completion Toast */}
      <DownloadToast />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <RootNavigation />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
