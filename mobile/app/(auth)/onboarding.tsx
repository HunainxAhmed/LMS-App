import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "../../theme/colors";
import {
  ShieldCheck,
  BellRing,
  BookOpen,
  DownloadCloud,
  CheckCircle,
  ArrowRight,
  HardDrive,
  Cloud,
} from "lucide-react-native";

const { width } = Dimensions.get("window");

export default function OnboardingScreen() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: "Your University, Organized.",
      subtitle:
        "No more jumping between Bahria CMS and LMS. View all your assignments, lecture slides, attendance, and deadlines in one fast, beautiful dashboard.",
      icon: <BookOpen size={48} color={colors.primary} />,
      badge: "CampusFlow Overview",
    },
    {
      title: "Strict Credential Privacy",
      subtitle:
        "We believe in absolute student privacy. CampusFlow offers a Local-Only Mode where your password never leaves your phone's hardware Android Keystore or iOS Keychain.",
      icon: <ShieldCheck size={48} color={colors.statusSafe} />,
      badge: "Zero Plaintext Storage",
    },
    {
      title: "Reliable Deadline Alerts",
      subtitle:
        "Opt-in Cloud Monitoring encrypts your password with AES-256-GCM to track deadlines 24/7. Get notified 48h, 24h, and 3h before assignments are due, plus instant absence updates.",
      icon: <BellRing size={48} color={colors.primary} />,
      badge: "Deduplicated Notifications",
    },
  ];

  const handleNext = () => {
    if (activeStep < steps.length - 1) {
      setActiveStep(activeStep + 1);
    } else {
      router.replace("/(auth)/login" as any);
    }
  };

  const current = steps[activeStep];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Skip button */}
        <View style={styles.topRow}>
          <View style={styles.pillBadge}>
            <Text style={styles.pillText}>{current.badge}</Text>
          </View>
          <TouchableOpacity onPress={() => router.replace("/(auth)/login" as any)}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Content Section */}
        <View style={styles.contentBox}>
          <View style={styles.iconCircle}>{current.icon}</View>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.subtitle}>{current.subtitle}</Text>

          {/* Privacy Breakdown if on Security Step */}
          {activeStep === 1 && (
            <View style={styles.privacyComparison}>
              <View style={styles.comparisonItem}>
                <HardDrive size={18} color={colors.primary} />
                <View style={styles.compText}>
                  <Text style={styles.compTitle}>Local-Only Mode</Text>
                  <Text style={styles.compDesc}>Saved exclusively in device hardware Keystore.</Text>
                </View>
              </View>

              <View style={styles.comparisonItem}>
                <Cloud size={18} color={colors.primary} />
                <View style={styles.compText}>
                  <Text style={styles.compTitle}>Cloud Monitoring Mode</Text>
                  <Text style={styles.compDesc}>AES-256-GCM encrypted for background alerts.</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Bottom Pagination & Button */}
        <View style={styles.bottomSection}>
          {/* Indicator Dots */}
          <View style={styles.dotsRow}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, activeStep === i && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.8}>
            <Text style={styles.nextButtonText}>
              {activeStep === steps.length - 1 ? "Get Started" : "Continue"}
            </Text>
            <ArrowRight size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillBadge: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  contentBox: {
    alignItems: "center",
    paddingVertical: 20,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  privacyComparison: {
    marginTop: 24,
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 12,
  },
  comparisonItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  compText: {
    flex: 1,
  },
  compTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  compDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bottomSection: {
    gap: 20,
    paddingBottom: 16,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceBorder,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
