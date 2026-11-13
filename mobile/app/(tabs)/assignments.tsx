import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useTabStore } from "../../stores/tabStore";

export default function AssignmentsRoute() {
  const router = useRouter();
  useEffect(() => {
    useTabStore.getState().scrollToTab(2);
    router.replace("/(tabs)" as any);
  }, [router]);
  return null;
}
