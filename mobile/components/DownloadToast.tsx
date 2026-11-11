import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import {
  CheckCircle2,
  FileText,
  ExternalLink,
  X,
  FileArchive,
  Download,
} from "lucide-react-native";
import { useDownloadToastStore } from "../stores/downloadToastStore";
import { openDownloadedFile } from "../services/downloadsRegistry";

export const DownloadToast: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { visible, payload, hide } = useDownloadToastStore();

  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<any>(null);

  useEffect(() => {
    if (visible && payload) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide after 6 seconds
      hideTimerRef.current = setTimeout(() => {
        handleDismiss();
      }, 6000);
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 120,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [visible, payload]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      hide();
    });
  };

  const handleOpen = () => {
    if (!payload) return;
    if (payload.onOpen) {
      payload.onOpen();
    } else {
      openDownloadedFile({
        id: "",
        fileName: payload.fileName,
        fileUri: payload.fileUri,
        mimeType: payload.mimeType || "application/pdf",
        category: payload.category || "assignment",
        downloadedAt: new Date().toISOString(),
      });
    }
    handleDismiss();
  };

  if (!visible && !payload) return null;

  const isZip = payload?.fileName?.toLowerCase().endsWith(".zip");

  // Position above bottom tab bar
  const bottomPosition = Math.max(insets.bottom + 65, 80);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.container,
        {
          bottom: bottomPosition,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.card}>
        {/* Left Icon Badge */}
        <View style={[styles.iconBox, isZip && styles.iconBoxZip]}>
          {isZip ? (
            <FileArchive size={20} color="#b45309" />
          ) : (
            <FileText size={20} color={colors.primary} />
          )}
          <View style={styles.checkBadge}>
            <CheckCircle2 size={11} color="#fff" />
          </View>
        </View>

        {/* Content Details */}
        <View style={styles.content}>
          <View style={styles.topLabelRow}>
            <Text style={styles.statusLabel}>DOWNLOAD COMPLETE</Text>
            {payload?.courseName && (
              <Text style={styles.courseTag} numberOfLines={1}>
                {payload.courseName}
              </Text>
            )}
          </View>

          <Text style={styles.fileName} numberOfLines={1}>
            {payload?.fileName}
          </Text>

          <Text style={styles.hintText}>Saved securely to device storage</Text>
        </View>

        {/* Action Button: Open */}
        <TouchableOpacity
          style={styles.openBtn}
          onPress={handleOpen}
          activeOpacity={0.8}
        >
          <ExternalLink size={13} color="#fff" />
          <Text style={styles.openBtnText}>Open</Text>
        </TouchableOpacity>

        {/* Dismiss Button */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 9999,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.2,
    borderColor: "#a7f3d0",
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  iconBoxZip: {
    backgroundColor: "#fef3c7",
  },
  checkBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: colors.statusSafe,
    borderRadius: 8,
    width: 14,
    height: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  topLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.statusSafe,
  },
  courseTag: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.textMuted,
    maxWidth: 120,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 17,
  },
  hintText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
    marginLeft: -4,
  },
});
