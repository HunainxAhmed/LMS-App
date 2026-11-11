import { QueryClient, focusManager } from "@tanstack/react-query";
import { AppState, AppStateStatus, Platform } from "react-native";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 5, // 5 seconds: keeps cached data responsive while enabling near real-time updates
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

// Sync React Query's focusManager with native app state (active vs backgrounded)
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (status: AppStateStatus) => {
    focusManager.setFocused(status === "active");
  });
}

/**
 * Invalidates and re-fetches all academic and dashboard queries across all mounted screens.
 * Causes pending counts, assignment status, and attendance to immediately update in real time.
 */
export function invalidateAllAcademicQueries() {
  try {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
    queryClient.invalidateQueries({ queryKey: ["courses"] });
    queryClient.invalidateQueries({ queryKey: ["notifications_unread"] });
  } catch (e) {
    console.debug("Query invalidation note:", e);
  }
}
