import React, { useRef, useEffect, useCallback, memo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useTabStore } from "../../stores/tabStore";
import { ModernBottomTabBar } from "../../components/ModernBottomTabBar";
import { HomeScreenContent } from "../../components/screens/HomeScreenContent";
import { CoursesScreenContent } from "../../components/screens/CoursesScreenContent";
import { AssignmentsScreenContent } from "../../components/screens/AssignmentsScreenContent";
import { LecturesScreenContent } from "../../components/screens/LecturesScreenContent";
import { DownloadsScreenContent } from "../../components/screens/DownloadsScreenContent";
import { ResultsScreenContent } from "../../components/screens/ResultsScreenContent";

// Memoize tab screen pages so they never re-render during swiping
const MemoHome = memo(HomeScreenContent);
const MemoCourses = memo(CoursesScreenContent);
const MemoAssignments = memo(AssignmentsScreenContent);
const MemoLectures = memo(LecturesScreenContent);
const MemoDownloads = memo(DownloadsScreenContent);
const MemoResults = memo(ResultsScreenContent);

export default function MasterSwipeableTabs() {
  const { width: screenWidth } = useWindowDimensions();
  const horizontalPagerRef = useRef<any>(null);

  // Select only what this container needs so tab index changes NEVER re-render the pager
  const pagerScrollEnabled = useTabStore((s) => s.pagerScrollEnabled);
  const targetTabIndex = useTabStore((s) => s.targetTabIndex);
  const clearTargetTab = useTabStore((s) => s.clearTargetTab);

  // Programmatic tab navigation (via bottom bar taps, shortcuts, or deep links)
  useEffect(() => {
    if (targetTabIndex !== null && horizontalPagerRef.current && screenWidth > 0) {
      horizontalPagerRef.current.scrollTo({
        x: targetTabIndex * screenWidth,
        animated: true,
      });
      clearTargetTab();
    }
  }, [targetTabIndex, screenWidth, clearTargetTab]);

  // Real-time tab sync during swipe: as soon as finger crosses halfway, update bottom bar instantly!
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (screenWidth <= 0) return;
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / screenWidth);
      if (pageIndex >= 0 && pageIndex <= 5) {
        const currentActive = useTabStore.getState().activeTabIndex;
        if (pageIndex !== currentActive) {
          useTabStore.getState().setActiveTabIndex(pageIndex);
        }
      }
    },
    [screenWidth]
  );

  return (
    <View style={styles.root}>
      {/* 1:1 Interactive Instagram-Style Swipeable Pager */}
      <ScrollView
        ref={horizontalPagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        scrollEnabled={pagerScrollEnabled}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        decelerationRate="fast"
        style={styles.pager}
        contentContainerStyle={{ width: screenWidth * 6 }}
      >
        {/* Tab 0: Home Dashboard */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <MemoHome />
        </View>

        {/* Tab 1: Attendance Tracker */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <MemoCourses />
        </View>

        {/* Tab 2: Assignments & Deadlines */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <MemoAssignments />
        </View>

        {/* Tab 3: Lecture Slides & Notes */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <MemoLectures />
        </View>

        {/* Tab 4: Downloads & Offline Storage */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <MemoDownloads />
        </View>

        {/* Tab 5: GPA & Results */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <MemoResults />
        </View>
      </ScrollView>

      {/* Persistent Modern Bottom Tab Bar */}
      <ModernBottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  pager: {
    flex: 1,
  },
});
