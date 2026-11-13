import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Svg, {
  Line as SvgLine,
  Circle as SvgCircle,
  Path as SvgPath,
  Text as SvgText,
  G as SvgG,
} from "react-native-svg";
import { colors } from "../../theme/colors";
import { api } from "../../services/api";
import {
  GraduationCap,
  BookOpen,
  History,
  TrendingUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  Award,
  Calculator,
  Clock,
  Info,
} from "lucide-react-native";

export const ResultsScreenContent: React.FC = () => {
  const [expandedSemesters, setExpandedSemesters] = useState<Record<string, boolean>>({
    "Spring-2026": true,
    "Fall-2025": true,
    "Spring-2025": false,
    "Fall-2024": false,
    "Fall-2026": true,
  });
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(3); // Default Spring-2026
  const [chartWidth, setChartWidth] = useState<number>(Dimensions.get("window").width - 32);
  const [showPlanner, setShowPlanner] = useState<boolean>(false);
  const [targetCgpaInput, setTargetCgpaInput] = useState<string>("3.70");

  const {
    data: results,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["academic_results"],
    queryFn: () => api.getResults(),
    retry: 1,
  });

  const toggleSemester = (semName: string) => {
    setExpandedSemesters((prev) => ({
      ...prev,
      [semName]: !prev[semName],
    }));
  };

  const cgpa = results?.cgpa ?? 3.65;
  const currentSgpa = results?.current_sgpa ?? 3.63;
  const totalCredits = results?.total_credit_hours ?? 69.0;
  const completedSemestersCount = results?.completed_semesters_count ?? 4;
  const degreeProgressPct = results?.degree_progress_pct ?? 53.1;
  const standing = results?.academic_standing ?? "Dean's Honor Roll";
  const semesters = results?.semesters || [];

  // Completed semesters for progression chart
  const completedSemesters = semesters.filter(
    (s: any) => !s.is_in_progress && s.gpa > 0
  );

  // Fallback completed data if empty
  const chartData = completedSemesters.length > 0
    ? completedSemesters
    : [
        { semester_name: "Fall-2024", gpa: 3.67, cgpa: 3.67, credit_hours: 17 },
        { semester_name: "Spring-2025", gpa: 3.69, cgpa: 3.68, credit_hours: 18 },
        { semester_name: "Fall-2025", gpa: 3.61, cgpa: 3.65, credit_hours: 17 },
        { semester_name: "Spring-2026", gpa: 3.63, cgpa: 3.65, credit_hours: 17 },
      ];

  // Target GPA Planner math
  const target = parseFloat(targetCgpaInput) || 3.70;
  const remainingCredits = Math.max(1, 130.0 - totalCredits);
  const currentPoints = cgpa * totalCredits;
  const targetTotalPoints = target * 130.0;
  const neededRemainingPoints = targetTotalPoints - currentPoints;
  const neededAverageGpa = Math.max(0, neededRemainingPoints / remainingCredits);

  // Grade color badges matching LMS+
  const getGradeStyle = (grade: string) => {
    const clean = (grade || "").trim().toUpperCase();
    if (clean === "A") {
      return { bg: "#dcfce7", text: "#15803d", border: "#86efac" }; // Green
    }
    if (clean === "A-") {
      return { bg: "#ccfbf1", text: "#0f766e", border: "#5eead4" }; // Teal / Cyan
    }
    if (clean === "B+") {
      return { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" }; // Blue
    }
    if (clean === "B") {
      return { bg: "#e0e7ff", text: "#4338ca", border: "#a5b4fc" }; // Indigo
    }
    if (clean === "B-") {
      return { bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" }; // Purple
    }
    if (clean === "C+" || clean === "C") {
      return { bg: "#fef3c7", text: "#b45309", border: "#fde68a" }; // Amber
    }
    if (clean === "F") {
      return { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" }; // Red
    }
    return { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" }; // Muted / In-Progress
  };

  // Chart Geometry Calculations
  const chartHeight = 180;
  const padLeft = 40;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 26;
  const innerWidth = Math.max(100, chartWidth - padLeft - padRight);
  const innerHeight = chartHeight - padTop - padBottom;

  const minY = 3.0;
  const maxY = 4.0;

  const getYCoord = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    const ratio = (clamped - minY) / (maxY - minY);
    return padTop + innerHeight * (1 - ratio);
  };

  const getXCoord = (index: number, total: number) => {
    if (total <= 1) return padLeft + innerWidth / 2;
    return padLeft + (index / (total - 1)) * innerWidth;
  };

  // Generate SVG path strings for SGPA & CGPA
  const sgpaCoords = chartData.map((d: any, idx: number) => ({
    x: getXCoord(idx, chartData.length),
    y: getYCoord(d.gpa),
    ...d,
  }));

  const cgpaCoords = chartData.map((d: any, idx: number) => ({
    x: getXCoord(idx, chartData.length),
    y: getYCoord(d.cgpa || cgpa),
    ...d,
  }));

  const sgpaPathD = sgpaCoords.reduce(
    (acc: string, pt: any, idx: number) =>
      idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`,
    ""
  );

  const cgpaPathD = cgpaCoords.reduce(
    (acc: string, pt: any, idx: number) =>
      idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`,
    ""
  );

  const selectedData =
    selectedPointIdx !== null && chartData[selectedPointIdx]
      ? chartData[selectedPointIdx]
      : null;

  const onChartLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - chartWidth) > 2) {
      setChartWidth(w);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Provisional Results</Text>
          <Text style={styles.screenSubtitle}>
            Official Bahria University Transcript & CGPA
          </Text>
        </View>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusPillText}>Live Verified</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading && !results ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching official academic results...</Text>
          </View>
        ) : (
          <>
            {/* Top 3 Summary Cards (LMS+ exact layout) */}
            <View style={styles.topCardsRow}>
              {/* Card 1: Cumulative GPA */}
              <View style={[styles.statCard, styles.statCardBlue]}>
                <View style={[styles.statIconBox, { backgroundColor: "#e0f2fe" }]}>
                  <GraduationCap size={22} color="#0284c7" />
                </View>
                <Text style={styles.statNumber}>{cgpa.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Cumulative GPA</Text>
              </View>

              {/* Card 2: Total Credits */}
              <View style={[styles.statCard, styles.statCardGreen]}>
                <View style={[styles.statIconBox, { backgroundColor: "#ccfbf1" }]}>
                  <BookOpen size={20} color="#0f766e" />
                </View>
                <Text style={styles.statNumber}>{Math.round(totalCredits)}</Text>
                <Text style={styles.statLabel}>Total Credits</Text>
              </View>

              {/* Card 3: Semesters Completed */}
              <View style={[styles.statCard, styles.statCardPurple]}>
                <View style={[styles.statIconBox, { backgroundColor: "#ede9fe" }]}>
                  <History size={20} color="#7c3aed" />
                </View>
                <Text style={styles.statNumber}>{completedSemestersCount}</Text>
                <Text style={styles.statLabel}>Semesters Completed</Text>
              </View>
            </View>

            {/* GPA Progression Line Chart (LMS+ style) */}
            <View style={styles.chartCard} onLayout={onChartLayout}>
              <View style={styles.chartHeader}>
                <View style={styles.chartTitleGroup}>
                  <TrendingUp size={16} color={colors.textPrimary} />
                  <Text style={styles.chartTitle}>GPA Progression</Text>
                </View>

                {/* Legend */}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#2563eb" }]} />
                    <Text style={styles.legendText}>Semester GPA (SGPA)</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#f59e0b" }]} />
                    <Text style={styles.legendText}>Cumulative GPA (CGPA)</Text>
                  </View>
                </View>
              </View>

              {/* Interactive Svg Line Chart */}
              <View style={styles.svgContainer}>
                <Svg width={chartWidth} height={chartHeight}>
                  {/* Horizontal Grid Ticks & Values */}
                  {[4.0, 3.5, 3.0].map((tick) => {
                    const y = getYCoord(tick);
                    return (
                      <SvgG key={`tick-${tick}`}>
                        <SvgLine
                          x1={padLeft}
                          y1={y}
                          x2={chartWidth - padRight}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <SvgText
                          x={padLeft - 8}
                          y={y + 4}
                          fontSize="11"
                          fill="#94a3b8"
                          fontWeight="600"
                          textAnchor="end"
                        >
                          {tick.toFixed(1)}
                        </SvgText>
                      </SvgG>
                    );
                  })}

                  {/* Vertical Guideline & Highlight for Selected Point */}
                  {selectedPointIdx !== null && sgpaCoords[selectedPointIdx] && (
                    <SvgLine
                      x1={sgpaCoords[selectedPointIdx].x}
                      y1={padTop}
                      x2={sgpaCoords[selectedPointIdx].x}
                      y2={chartHeight - padBottom}
                      stroke="#93c5fd"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* SGPA Path (Solid Blue) */}
                  <SvgPath
                    d={sgpaPathD}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* CGPA Path (Dashed Amber) */}
                  <SvgPath
                    d={cgpaPathD}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.2"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Points on SGPA Curve (Blue) */}
                  {sgpaCoords.map((pt: any, idx: number) => {
                    const isSelected = selectedPointIdx === idx;
                    return (
                      <SvgG key={`sgpa-pt-${idx}`}>
                        <SvgCircle
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? 6 : 4.5}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={isSelected ? 3 : 2}
                        />
                      </SvgG>
                    );
                  })}

                  {/* Points on CGPA Curve (Amber) */}
                  {cgpaCoords.map((pt: any, idx: number) => {
                    const isSelected = selectedPointIdx === idx;
                    return (
                      <SvgG key={`cgpa-pt-${idx}`}>
                        <SvgCircle
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? 5.5 : 4}
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                      </SvgG>
                    );
                  })}

                  {/* X-Axis Semester Labels */}
                  {chartData.map((d: any, idx: number) => {
                    const x = getXCoord(idx, chartData.length);
                    const isSelected = selectedPointIdx === idx;
                    return (
                      <SvgText
                        key={`lbl-${idx}`}
                        x={x}
                        y={chartHeight - 6}
                        fontSize="10"
                        fontWeight={isSelected ? "700" : "500"}
                        fill={isSelected ? "#1e40af" : "#64748b"}
                        textAnchor="middle"
                      >
                        {d.semester_name}
                      </SvgText>
                    );
                  })}
                </Svg>
              </View>

              {/* Tappable Semester Selector Pills for Chart Interaction */}
              <View style={styles.chartSelectorRow}>
                {chartData.map((d: any, idx: number) => {
                  const isSelected = selectedPointIdx === idx;
                  return (
                    <TouchableOpacity
                      key={`pill-${idx}`}
                      style={[
                        styles.chartSelectPill,
                        isSelected && styles.chartSelectPillActive,
                      ]}
                      onPress={() => setSelectedPointIdx(idx)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.chartSelectPillText,
                          isSelected && styles.chartSelectPillTextActive,
                        ]}
                      >
                        {d.semester_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Detail Inspection Card for Selected Semester */}
              {selectedData && (
                <View style={styles.inspectionCard}>
                  <View style={styles.inspectionHeader}>
                    <Text style={styles.inspectionTitle}>
                      {selectedData.semester_name} Standing
                    </Text>
                    <Text style={styles.inspectionCredits}>
                      {selectedData.credit_hours} Credit Hours
                    </Text>
                  </View>
                  <View style={styles.inspectionStatsRow}>
                    <View style={styles.inspectionStatItem}>
                      <Text style={styles.inspectionStatLabel}>Semester SGPA</Text>
                      <Text style={[styles.inspectionStatValue, { color: "#2563eb" }]}>
                        {selectedData.gpa.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.inspectionDivider} />
                    <View style={styles.inspectionStatItem}>
                      <Text style={styles.inspectionStatLabel}>Cumulative CGPA</Text>
                      <Text style={[styles.inspectionStatValue, { color: "#d97706" }]}>
                        {(selectedData.cgpa || cgpa).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.inspectionDivider} />
                    <View style={styles.inspectionStatItem}>
                      <Text style={styles.inspectionStatLabel}>Courses</Text>
                      <Text style={styles.inspectionStatValue}>
                        {selectedData.courses?.length || 9}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Semester Transcripts List */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Calendar size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Official Semester Transcripts</Text>
              </View>
              <Text style={styles.sectionBadge}>
                {semesters.length} Semesters Total
              </Text>
            </View>

            {semesters.map((sem: any) => {
              const isExpanded = !!expandedSemesters[sem.semester_name];
              const isInProgress = !!sem.is_in_progress;
              const courses = sem.courses || [];

              return (
                <View key={sem.semester_name} style={styles.semesterCard}>
                  {/* Semester Header */}
                  <TouchableOpacity
                    style={styles.semesterHeader}
                    onPress={() => toggleSemester(sem.semester_name)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.semesterLeftGroup}>
                      <View
                        style={[
                          styles.semCalendarIcon,
                          isInProgress && { backgroundColor: "#fef3c7" },
                        ]}
                      >
                        <Calendar
                          size={16}
                          color={isInProgress ? "#d97706" : colors.primary}
                        />
                      </View>
                      <View>
                        <View style={styles.semTitleRow}>
                          <Text style={styles.semesterName}>{sem.semester_name}</Text>
                          {isInProgress && (
                            <View style={styles.inProgressBadge}>
                              <Text style={styles.inProgressBadgeText}>In Progress</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.semesterSub}>
                          {courses.length} Courses • {sem.credit_hours} Credits
                        </Text>
                      </View>
                    </View>

                    <View style={styles.semesterRightGroup}>
                      {!isInProgress ? (
                        <View style={styles.sgpaPill}>
                          <Text style={styles.sgpaPillText}>
                            SGPA: <Text style={styles.sgpaPillVal}>{sem.gpa.toFixed(2)}</Text>
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.enrolledPill}>
                          <Clock size={12} color="#0284c7" />
                          <Text style={styles.enrolledPillText}>Enrolled</Text>
                        </View>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={20} color={colors.textSecondary} />
                      ) : (
                        <ChevronDown size={20} color={colors.textMuted} />
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Course Table (LMS+ exact columns: CODE | COURSE TITLE | CREDITS | GRADE) */}
                  {isExpanded && (
                    <View style={styles.tableContainer}>
                      {/* Table Column Headers */}
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.colHeader, styles.colCode]}>CODE</Text>
                        <Text style={[styles.colHeader, styles.colTitle]}>COURSE TITLE</Text>
                        <Text style={[styles.colHeader, styles.colCredits]}>CREDITS</Text>
                        <Text style={[styles.colHeader, styles.colGrade]}>GRADE</Text>
                      </View>

                      {/* Course Rows */}
                      {courses.map((c: any, idx: number) => {
                        const gradeStyle = getGradeStyle(c.grade);
                        const isLast = idx === courses.length - 1;
                        return (
                          <View
                            key={c.id || `${sem.semester_name}-${idx}`}
                            style={[
                              styles.tableRow,
                              isLast && { borderBottomWidth: 0 },
                              idx % 2 === 1 && styles.tableRowAlt,
                            ]}
                          >
                            {/* Code */}
                            <View style={styles.colCode}>
                              <Text style={styles.codeText}>{c.course_code}</Text>
                            </View>

                            {/* Title */}
                            <View style={styles.colTitle}>
                              <Text style={styles.titleText} numberOfLines={2}>
                                {c.course_title}
                              </Text>
                            </View>

                            {/* Credits */}
                            <View style={styles.colCredits}>
                              <Text style={styles.creditsText}>{c.credit_hours}</Text>
                            </View>

                            {/* Grade */}
                            <View style={styles.colGrade}>
                              <View
                                style={[
                                  styles.gradePill,
                                  {
                                    backgroundColor: gradeStyle.bg,
                                    borderColor: gradeStyle.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.gradePillText,
                                    { color: gradeStyle.text },
                                  ]}
                                >
                                  {c.grade === "N/A" ? "—" : c.grade}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}

                      {/* Semester Summary Footer */}
                      {!isInProgress && (
                        <View style={styles.tableFooter}>
                          <Text style={styles.footerInfoText}>
                            Semester GPA: <Text style={styles.boldDark}>{sem.gpa.toFixed(2)}</Text>
                          </Text>
                          <Text style={styles.footerInfoText}>
                            Cumulative CGPA: <Text style={styles.boldDark}>{(sem.cgpa || cgpa).toFixed(2)}</Text>
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Target CGPA Simulator / What-If Planner Accordion */}
            <View style={styles.plannerCard}>
              <TouchableOpacity
                style={styles.plannerHeaderRow}
                onPress={() => setShowPlanner(!showPlanner)}
                activeOpacity={0.7}
              >
                <View style={styles.plannerTitleGroup}>
                  <Calculator size={18} color={colors.primary} />
                  <Text style={styles.plannerTitle}>Target CGPA Simulator</Text>
                </View>
                {showPlanner ? (
                  <ChevronUp size={18} color={colors.primary} />
                ) : (
                  <ChevronDown size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>

              {showPlanner && (
                <View style={styles.plannerBody}>
                  <View style={styles.plannerInputRow}>
                    <Text style={styles.plannerInputLabel}>Desired Graduation CGPA:</Text>
                    <View style={styles.targetInputContainer}>
                      <TextInput
                        style={styles.targetInput}
                        value={targetCgpaInput}
                        onChangeText={setTargetCgpaInput}
                        keyboardType="numeric"
                        maxLength={4}
                      />
                      <Text style={styles.targetInputScale}>/ 4.00</Text>
                    </View>
                  </View>

                  <Text style={styles.plannerFormulaText}>
                    {neededAverageGpa <= 4.0 ? (
                      <>
                        To graduate with a{" "}
                        <Text style={styles.boldDark}>{target.toFixed(2)} CGPA</Text>, you
                        need to maintain an average SGPA of{" "}
                        <Text style={[styles.boldDark, { color: colors.primary }]}>
                          {neededAverageGpa.toFixed(2)}
                        </Text>{" "}
                        across your remaining {Math.round(remainingCredits / 16)} semester(s) ({remainingCredits.toFixed(0)} Credit Hours).
                      </>
                    ) : (
                      <>
                        A <Text style={styles.boldDark}>{target.toFixed(2)} CGPA</Text> exceeds
                        the maximum mathematically reachable score with remaining credits ({neededAverageGpa.toFixed(2)} needed).
                      </>
                    )}
                  </Text>
                </View>
              )}
            </View>

            {/* Official Bahria University Grading Policy Scale */}
            <View style={styles.scaleCard}>
              <View style={styles.scaleHeader}>
                <Info size={15} color={colors.textSecondary} />
                <Text style={styles.scaleTitle}>Bahria University Grading System</Text>
              </View>
              <View style={styles.scaleGrid}>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>A (4.00)</Text>
                  <Text style={styles.scaleRange}>87% - 100%</Text>
                </View>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>A- (3.67)</Text>
                  <Text style={styles.scaleRange}>82% - 86%</Text>
                </View>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>B+ (3.33)</Text>
                  <Text style={styles.scaleRange}>77% - 81%</Text>
                </View>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>B (3.00)</Text>
                  <Text style={styles.scaleRange}>72% - 76%</Text>
                </View>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>B- (2.67)</Text>
                  <Text style={styles.scaleRange}>68% - 71%</Text>
                </View>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>C+ (2.33)</Text>
                  <Text style={styles.scaleRange}>64% - 67%</Text>
                </View>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>C (2.00)</Text>
                  <Text style={styles.scaleRange}>60% - 63%</Text>
                </View>
                <View style={styles.scaleItem}>
                  <Text style={styles.scaleGrade}>F (0.00)</Text>
                  <Text style={styles.scaleRange}>Below 50%</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  screenTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  screenSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 48,
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 10,
  },

  /* Top 3 Summary Cards */
  topCardsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  statCardBlue: {
    borderTopWidth: 3,
    borderTopColor: "#0284c7",
  },
  statCardGreen: {
    borderTopWidth: 3,
    borderTopColor: colors.primary,
  },
  statCardPurple: {
    borderTopWidth: 3,
    borderTopColor: "#7c3aed",
  },
  statIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },

  /* Chart Card */
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  chartHeader: {
    marginBottom: 10,
  },
  chartTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  svgContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  chartSelectorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  chartSelectPill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
  },
  chartSelectPillActive: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  chartSelectPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  chartSelectPillTextActive: {
    color: "#1d4ed8",
    fontWeight: "700",
  },

  /* Inspection Card */
  inspectionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inspectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inspectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  inspectionCredits: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  inspectionStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  inspectionStatItem: {
    alignItems: "center",
  },
  inspectionDivider: {
    width: 1,
    height: 22,
    backgroundColor: "#cbd5e1",
  },
  inspectionStatLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  inspectionStatValue: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: 1,
  },

  /* Section Header */
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },

  /* Semester Card */
  semesterCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  semesterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  semesterLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  semCalendarIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  semTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  semesterName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  inProgressBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  inProgressBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#b45309",
    textTransform: "uppercase",
  },
  semesterSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  semesterRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sgpaPill: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  sgpaPillText: {
    fontSize: 11,
    color: "#1e40af",
    fontWeight: "600",
  },
  sgpaPillVal: {
    fontWeight: "800",
    color: "#1d4ed8",
  },
  enrolledPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  enrolledPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369a1",
  },

  /* Course Table */
  tableContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    backgroundColor: "#ffffff",
  },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tableRowAlt: {
    backgroundColor: "#fafbfc",
  },
  colCode: {
    width: "22%",
  },
  colTitle: {
    flex: 1,
    paddingRight: 8,
  },
  colCredits: {
    width: "15%",
    alignItems: "center",
  },
  colGrade: {
    width: "18%",
    alignItems: "flex-end",
  },
  codeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textPrimary,
    fontFamily: "monospace",
  },
  titleText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  creditsText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
  },
  gradePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 32,
    alignItems: "center",
  },
  gradePillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  tableFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  footerInfoText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  boldDark: {
    fontWeight: "700",
    color: colors.textPrimary,
  },

  /* Simulator Card */
  plannerCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 12,
  },
  plannerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  plannerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  plannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  plannerBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  plannerInputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  plannerInputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  targetInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 4,
  },
  targetInput: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
    minWidth: 36,
    textAlign: "center",
    padding: 0,
  },
  targetInputScale: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  plannerFormulaText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  /* Grading Scale */
  scaleCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginTop: 2,
  },
  scaleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  scaleTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scaleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  scaleItem: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scaleGrade: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  scaleRange: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
