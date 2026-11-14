import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { colors } from "../theme/colors";
import {
  HeartHandshake,
  CheckCircle2,
  Calendar,
  X,
  ShieldCheck,
  Award,
  Clock,
  Sparkles,
} from "lucide-react-native";

export interface CommunityServiceRecord {
  semester: string;
  organization: string;
  job_title?: string;
  completed_date: string;
  hours: number;
}

interface CommunityServicesModalProps {
  visible: boolean;
  onClose: () => void;
  totalHours?: number;
  requiredHours?: number;
  records?: CommunityServiceRecord[];
}

export const CommunityServicesModal: React.FC<CommunityServicesModalProps> = ({
  visible,
  onClose,
  totalHours = 0,
  requiredHours = 40,
  records = [],
}) => {
  if (!visible) return null;

  const pct = Math.min(100, Math.round((totalHours / (requiredHours || 40)) * 100));
  const remainingHours = Math.max(0, (requiredHours || 40) - totalHours);
  const isFulfilled = totalHours >= (requiredHours || 40);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconContainer}>
                <HeartHandshake size={20} color={colors.primary} />
              </View>
              <View style={styles.headerTextGroup}>
                <Text style={styles.headerTitle}>Community Service (CSP)</Text>
                <Text style={styles.headerSubtitle}>
                  Official Bahria University Clearance
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Progress Overview Card */}
            <View style={styles.progressCard}>
              <View style={styles.progressCardHeader}>
                <View>
                  <Text style={styles.progressLabel}>COMPLETION PROGRESS</Text>
                  <View style={styles.hoursRow}>
                    <Text style={styles.totalHoursText}>{totalHours}</Text>
                    <Text style={styles.requiredHoursText}> / {requiredHours} hrs</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    isFulfilled ? styles.statusBadgeCompleted : styles.statusBadgePending,
                  ]}
                >
                  {isFulfilled ? (
                    <>
                      <CheckCircle2 size={13} color="#065f46" />
                      <Text style={styles.statusBadgeTextCompleted}>Fulfilled</Text>
                    </>
                  ) : (
                    <>
                      <Clock size={13} color="#92400e" />
                      <Text style={styles.statusBadgeTextPending}>
                        {remainingHours} hrs left
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: isFulfilled ? colors.statusSafe : colors.primary,
                    },
                  ]}
                />
              </View>

              <View style={styles.progressFooter}>
                <Text style={styles.progressPercentText}>{pct}% completed</Text>
                <Text style={styles.progressDegreeRequirement}>
                  40 hours required for graduation
                </Text>
              </View>
            </View>

            {/* List Section Header */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <Award size={15} color={colors.primary} />
                <Text style={styles.sectionTitle}>
                  Recorded Activities ({records.length})
                </Text>
              </View>
              <View style={styles.cmsLivePill}>
                <ShieldCheck size={12} color="#059669" />
                <Text style={styles.cmsLiveText}>CMS Verified</Text>
              </View>
            </View>

            {/* Activities List */}
            {records && records.length > 0 ? (
              records.map((item, index) => (
                <View key={`csp-${index}-${item.completed_date}`} style={styles.activityCard}>
                  <View style={styles.activityTopRow}>
                    <View style={styles.semesterPill}>
                      <Text style={styles.semesterPillText}>{item.semester}</Text>
                    </View>
                    <View style={styles.hoursPill}>
                      <Text style={styles.hoursPillText}>+{item.hours} hrs</Text>
                    </View>
                  </View>

                  <Text style={styles.organizationText}>{item.organization}</Text>

                  {item.job_title && item.job_title !== "N/A" && (
                    <Text style={styles.jobTitleText}>Role: {item.job_title}</Text>
                  )}

                  <View style={styles.dateRow}>
                    <Calendar size={13} color={colors.textMuted} />
                    <Text style={styles.dateText}>{item.completed_date}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <HeartHandshake size={32} color={colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No Activities Recorded</Text>
                <Text style={styles.emptySubtitle}>
                  No community service hours recorded yet on Bahria CMS. Participate in
                  university-endorsed volunteer drives to earn credit.
                </Text>
              </View>
            )}

            {/* CMS Portal Reference */}
            <View style={styles.cmsDisclaimer}>
              <Sparkles size={14} color={colors.primary} />
              <Text style={styles.cmsDisclaimerText}>
                Data is scraped and synchronized directly with Bahria University CMS
                (Student &gt; Exams &gt; Community Services).
              </Text>
            </View>
          </ScrollView>

          {/* Close Action Button */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  backdropTouch: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Dimensions.get("window").height * 0.82,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  progressCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 20,
  },
  progressCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  progressLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 2,
  },
  totalHoursText: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: -0.8,
  },
  requiredHoursText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textSecondary,
    marginLeft: 3,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeCompleted: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  statusBadgePending: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  statusBadgeTextCompleted: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065f46",
  },
  statusBadgeTextPending: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  progressDegreeRequirement: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cmsLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  cmsLiveText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#059669",
  },
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorderSubtle,
    marginBottom: 10,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  activityTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  semesterPill: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.surfaceBorder,
  },
  semesterPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  hoursPill: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.primaryBorder,
  },
  hoursPillText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.primary,
  },
  organizationText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 19,
    marginBottom: 4,
  },
  jobTitleText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  dateText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12.5,
    fontWeight: "400",
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  cmsDisclaimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primarySubtle,
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  cmsDisclaimerText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.primaryDark,
    flex: 1,
    lineHeight: 16,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});
