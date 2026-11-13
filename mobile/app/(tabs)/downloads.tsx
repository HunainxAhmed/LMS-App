import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useTabStore } from "../../stores/tabStore";

export default function DownloadsRoute() {
  const router = useRouter();
  useEffect(() => {
    useTabStore.getState().scrollToTab(4);
    router.replace("/(tabs)" as any);
  }, [router]);
  return null;
}
