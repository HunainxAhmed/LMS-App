import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useTabStore } from "../../stores/tabStore";

export default function LecturesRoute() {
  const router = useRouter();
  useEffect(() => {
    useTabStore.getState().scrollToTab(3);
    router.replace("/(tabs)" as any);
  }, [router]);
  return null;
}
