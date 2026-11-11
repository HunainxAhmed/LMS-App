import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { queryClient } from "../services/queryClient";
import { useAuthStore } from "../stores/authStore";
import { setupNotifications } from "../services/notifications";
import { checkForAppUpdate, UpdateInfo } from "../services/updater";
import { InAppUpdateModal } from "../components/InAppUpdateModal";

function RootNavigation() {
  const { isAuthenticated, account, isLoading, checkAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  useEffect(() => {
    checkAuth().catch(() => {});
    setupNotifications().catch(() => {});

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

    return () => clearTimeout(updateTimer);
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
