import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../theme/colors";
import {
  AlarmClock,
  RotateCcw,
  Square,
  Calendar,
  Sparkles,
  ArrowRight,
  BellRing,
} from "lucide-react-native";
import { useAlarmStore } from "../stores/alarmStore";

export const ActiveAlarmRingingModal: React.FC = () => {
  const router = useRouter();
  const { activeRingingAlarm, dismissRingingAlarm, cancelAlarm, snoozeAlarm, isLoading } =
    useAlarmStore();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (activeRingingAlarm) {
      // Pulsing pulse animation
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );

      // Bell shaking animation
      const shakeLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 10, duration: 80, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
          Animated.delay(400),
        ])
      );

      pulseLoop.start();
      shakeLoop.start();

      return () => {
        pulseLoop.stop();
        shakeLoop.stop();
      };
    }
  }, [activeRingingAlarm, pulseAnim, shakeAnim]);

  if (!activeRingingAlarm) return null;

  const handleStop = async () => {
    try {
      await cancelAlarm(activeRingingAlarm.assignmentId);
    } catch {}
    dismissRingingAlarm();
  };

  const handleSnooze = async () => {
    try {
      await snoozeAlarm(activeRingingAlarm.assignmentId, 24);
    } catch {}
    dismissRingingAlarm();
  };

  const handleView = () => {
    dismissRingingAlarm();
    router.push("/(tabs)/assignments" as any);
  };

  return (
    <Modal visible={true} transparent={true} animationType="fade" statusBarTranslucent={true}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Pulsing Alarm Icon Badge */}
          <Animated.View
            style={[
              styles.iconWrapper,
              {
                transform: [
                  { scale: pulseAnim },
                  {
                    rotate: shakeAnim.interpolate({
                      inputRange: [-10, 10],
                      outputRange: ["-12deg", "12deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            <AlarmClock size={44} color="#ffffff" strokeWidth={2.3} />
          </Animated.View>

          {/* Urgent Alarm Tag */}
          <View style={styles.badgeRow}>
            <View style={styles.urgentBadge}>
              <BellRing size={12} color="#dc2626" />
              <Text style={styles.urgentBadgeText}>ASSIGNMENT ALARM RINGING</Text>
            </View>
          </View>

          {/* Course & Assignment Details */}
          <Text style={styles.courseName} numberOfLines={1}>
            {activeRingingAlarm.courseName}
          </Text>

          <Text style={styles.assignmentTitle} numberOfLines={2}>
            {activeRingingAlarm.title}
          </Text>

          <View style={styles.deadlineContainer}>
            <Calendar size={14} color="#f59e0b" />
            <Text style={styles.deadlineText}>
              Due: {activeRingingAlarm.deadlineRaw || "Check official LMS"}
            </Text>
          </View>

          <Text style={styles.subText}>
            It's time to complete and submit your coursework before the Bahria portal deadline closes!
          </Text>

          {/* Action Buttons */}
          <View style={styles.btnStack}>
            {/* Snooze 24h */}
            <TouchableOpacity
              style={styles.snoozeBtn}
              onPress={handleSnooze}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <RotateCcw size={18} color="#2563eb" />
              <Text style={styles.snoozeBtnText}>Snooze 24 Hours</Text>
            </TouchableOpacity>

            {/* Stop Alarm */}
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={handleStop}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <Square size={16} color="#ffffff" fill="#ffffff" />
              <Text style={styles.stopBtnText}>Stop / Dismiss Alarm</Text>
            </TouchableOpacity>

            {/* View Assignment */}
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={handleView}
              activeOpacity={0.8}
            >
              <Text style={styles.viewBtnText}>Open Coursework</Text>
              <ArrowRight size={15} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 29, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 26,
    alignItems: "center",
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 20,
    borderWidth: 1.5,
    borderColor: "#fecaca",
  },
  iconWrapper: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    marginTop: -8,
    marginBottom: 16,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  badgeRow: {
    marginBottom: 12,
  },
  urgentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fee2e2",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  urgentBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b91c1c",
    letterSpacing: 0.8,
  },
  courseName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
    marginBottom: 6,
  },
  assignmentTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 14,
  },
  deadlineContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    marginBottom: 12,
  },
  deadlineText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
  },
  subText: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  btnStack: {
    width: "100%",
    gap: 10,
  },
  snoozeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
  },
  snoozeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  stopBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 2,
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
});
