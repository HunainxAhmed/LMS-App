import { useRef } from "react";
import { PanResponder, GestureResponderEvent, PanResponderGestureState } from "react-native";
import { useRouter, usePathname } from "expo-router";

interface TabRouteDef {
  target: string;
  aliases: string[];
}

const TAB_ORDER: TabRouteDef[] = [
  { target: "/(tabs)", aliases: ["", "/", "/(tabs)", "/(tabs)/index", "index"] },
  { target: "/(tabs)/courses", aliases: ["courses", "/courses", "/(tabs)/courses"] },
  { target: "/(tabs)/assignments", aliases: ["assignments", "/assignments", "/(tabs)/assignments"] },
  { target: "/(tabs)/lectures", aliases: ["lectures", "/lectures", "/(tabs)/lectures"] },
  { target: "/(tabs)/downloads", aliases: ["downloads", "/downloads", "/(tabs)/downloads"] },
  { target: "/(tabs)/results", aliases: ["results", "/results", "/(tabs)/results"] },
];

export function useSwipeTabNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        // Only trigger on clear horizontal swipe gesture (at least 35px dx and 1.5x dy)
        const isHorizontal =
          Math.abs(gestureState.dx) > 35 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
        return isHorizontal;
      },
      onPanResponderRelease: (
        evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        const { dx, vx } = gestureState;
        // Swipe threshold (distance > 50px or fast velocity > 0.35)
        if (Math.abs(dx) > 50 || Math.abs(vx) > 0.35) {
          const currentPath = pathnameRef.current || "";
          const trimmed = currentPath.replace(/^\/+/, "").replace(/\(tabs\)\/?/, "");

          const currentIndex = TAB_ORDER.findIndex(
            (tab) =>
              tab.aliases.includes(currentPath) ||
              tab.aliases.includes(trimmed) ||
              currentPath.endsWith(tab.aliases[0])
          );

          if (currentIndex === -1) return;

          if (dx < 0 && currentIndex < TAB_ORDER.length - 1) {
            // Swiped left -> navigate forward to next tab
            router.push(TAB_ORDER[currentIndex + 1].target as any);
          } else if (dx > 0 && currentIndex > 0) {
            // Swiped right -> navigate back to previous tab
            router.push(TAB_ORDER[currentIndex - 1].target as any);
          }
        }
      },
    })
  ).current;

  return panResponder.panHandlers;
}
