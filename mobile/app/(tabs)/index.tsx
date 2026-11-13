import React, { useRef, useEffect } from "react";
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

export default function MasterSwipeableTabs() {
  const { width: screenWidth } = useWindowDimensions();
  const horizontalPagerRef = useRef<any>(null);
  const {
    activeTabIndex,
    pagerScrollEnabled,
    targetTabIndex,
    setActiveTabIndex,
    clearTargetTab,
  } = useTabStore();

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

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (screenWidth <= 0) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / screenWidth);
    if (pageIndex >= 0 && pageIndex <= 5 && pageIndex !== activeTabIndex) {
      setActiveTabIndex(pageIndex);
    }
  };

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
        onMomentumScrollEnd={handleMomentumScrollEnd}
        decelerationRate="fast"
        style={styles.pager}
        contentContainerStyle={{ width: screenWidth * 6 }}
      >
        {/* Tab 0: Home Dashboard */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <HomeScreenContent />
        </View>

        {/* Tab 1: Attendance Tracker */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <CoursesScreenContent />
        </View>

        {/* Tab 2: Assignments & Deadlines */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <AssignmentsScreenContent />
        </View>

        {/* Tab 3: Lecture Slides & Notes */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <LecturesScreenContent />
        </View>

        {/* Tab 4: Downloads & Offline Storage */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <DownloadsScreenContent />
        </View>

        {/* Tab 5: GPA & Results */}
        <View style={{ width: screenWidth, flex: 1 }}>
          <ResultsScreenContent />
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
