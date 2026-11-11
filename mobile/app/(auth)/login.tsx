import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { useAuthStore } from "../../stores/authStore";
import { getServerUrl, setServerUrl, DEFAULT_API_URL } from "../../services/storage";
import { ShieldCheck, Eye, EyeOff, Server, Lock, ChevronDown, Check } from "lucide-react-native";

const CAMPUSES = [
  { id: "2", name: "Karachi Campus" },
  { id: "1", name: "Islamabad E-8 Campus" },
  { id: "9", name: "Islamabad H-11 Campus" },
  { id: "3", name: "Lahore Campus" },
  { id: "6", name: "Health Sciences Campus (Karachi)" },
  { id: "12", name: "Health Sciences Campus (Islamabad)" },
  { id: "5", name: "IPP (Karachi)" },
  { id: "10", name: "Finishing School" },
  { id: "4", name: "NCMPR" },
  { id: "8", name: "PN Nursing College" },
  { id: "7", name: "PN School Of Logistics" },
];

export default function LoginScreen() {
  const { connectStudentComplete, isLoading } = useAuthStore();

  const [enrollment, setEnrollment] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedCampus, setSelectedCampus] = useState(CAMPUSES[0]);
  const [showCampusPicker, setShowCampusPicker] = useState(false);
  const [enableCloudMonitoring, setEnableCloudMonitoring] = useState(true);
  const [connectingStep, setConnectingStep] = useState("");

  const handleConnect = async () => {
    if (!enrollment.trim() || !password.trim()) {
      Alert.alert("Missing Fields", "Please enter your Bahria Enrollment ID and Password.");
      return;
    }

    try {
      setConnectingStep("Connecting to Bahria University Portal...");

      await connectStudentComplete({
        enrollment: enrollment.trim().toUpperCase(),
        password: password,
        campus_id: selectedCampus.id,
        campus_name: selectedCampus.name,
        enable_cloud_monitoring: enableCloudMonitoring,
      });

      // Navigation automatically proceeds to (tabs) via RootLayout state observer once account is ready
    } catch (e: any) {
      setConnectingStep("");
      Alert.alert(
        "Connection Error",
        e.message || "Failed to connect with university portal. Please verify your enrollment ID, password, and campus."
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header with Premium App Icon */}
          <View style={styles.header}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>LMS ∞</Text>
            <Text style={styles.brandSubtitle}>Your University, Limitless.</Text>
            <View style={styles.unofficialPill}>
              <Text style={styles.unofficialText}>Unofficial Bahria Student Companion</Text>
            </View>
          </View>

          {/* Form Container */}
          <View style={styles.card}>
            {/* Campus Selector */}
            <Text style={styles.fieldLabel}>Campus / Institute</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowCampusPicker(!showCampusPicker)}
              activeOpacity={0.8}
            >
              <Text style={styles.dropdownValue}>{selectedCampus.name}</Text>
              <ChevronDown size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {showCampusPicker && (
              <View style={styles.pickerContainer}>
                {CAMPUSES.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.pickerOption,
                      selectedCampus.id === c.id && styles.pickerOptionActive,
                    ]}
                    onPress={() => {
                      setSelectedCampus(c);
                      setShowCampusPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        selectedCampus.id === c.id && styles.pickerOptionTextActive,
                      ]}
                    >
                      {c.name}
                    </Text>
                    {selectedCampus.id === c.id && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Enrollment */}
            <Text style={styles.fieldLabel}>Enrollment ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 02-134212-001"
              placeholderTextColor={colors.textMuted}
              value={enrollment}
              onChangeText={setEnrollment}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            {/* Password */}
            <Text style={styles.fieldLabel}>Portal Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter university password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff size={18} color={colors.textSecondary} />
                ) : (
                  <Eye size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>

            {/* Persistent Login & 24/7 Cloud Sync Checkbox */}
            <TouchableOpacity
              style={styles.storageToggleRow}
              onPress={() => setEnableCloudMonitoring(!enableCloudMonitoring)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, enableCloudMonitoring && styles.checkboxActive]}>
                {enableCloudMonitoring && <Check size={14} color="#fff" strokeWidth={3} />}
              </View>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleTitle}>
                  Stay Logged In & 24/7 Cloud Sync (Recommended)
                </Text>
                <Text style={styles.toggleDesc}>
                  {enableCloudMonitoring
                    ? "Keeps your Bahria portal session active 24/7 so you never get logged out, and sends instant assignment & attendance alerts."
                    : "Local-only session. You may need to sign in repeatedly when the university portal session expires."}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Connect Button */}
            <TouchableOpacity
              style={[styles.connectButton, isLoading && styles.connectButtonDisabled]}
              onPress={handleConnect}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.connectButtonText}>
                    {connectingStep || "Connecting..."}
                  </Text>
                </View>
              ) : (
                <Text style={styles.connectButtonText}>Connect Bahria Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Privacy Security Notice */}
          <View style={styles.securityFooter}>
            <ShieldCheck size={16} color={colors.primary} />
            <Text style={styles.securityText}>
              End-to-End Secure. We never share or expose your university credentials.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoImage: {
    width: 74,
    height: 74,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  unofficialPill: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  unofficialText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  dropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surfaceSecondary,
  },
  dropdownValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  pickerContainer: {
    marginTop: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    overflow: "hidden",
  },
  pickerOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorderLight,
  },
  pickerOptionActive: {
    backgroundColor: colors.primarySubtle,
  },
  pickerOptionText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  pickerOptionTextActive: {
    fontWeight: "700",
    color: colors.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSecondary,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.textPrimary,
  },
  eyeButton: {
    padding: 12,
  },
  storageToggleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  toggleDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  connectButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  serverConfigToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
  },
  serverConfigText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
  },
  serverConfigBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 10,
  },
  serverConfigLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 4,
  },
  serverInput: {
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  serverHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  securityFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
  },
  securityText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});
