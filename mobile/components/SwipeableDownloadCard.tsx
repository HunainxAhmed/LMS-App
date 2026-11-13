import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
} from "react-native";
import { colors } from "../theme/colors";
import { DownloadedItem, formatBytes } from "../services/downloadsRegistry";
import { useTabStore } from "../stores/tabStore";
import { Trash2, Share2, ExternalLink, Check } from "lucide-react-native";

interface SwipeableDownloadCardProps {
  item: DownloadedItem;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onLongPress: () => void;
  onPress: () => void;
  onDelete: () => void;
  onShare: () => void;
  renderFileIcon: (item: DownloadedItem) => React.ReactNode;
}

export const SwipeableDownloadCard: React.FC<SwipeableDownloadCardProps> = ({
  item,
  isMultiSelectMode,
  isSelected,
  onToggleSelect,
  onLongPress,
  onPress,
  onDelete,
  onShare,
  renderFileIcon,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;

  const closeSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
    setIsOpen(false);
    useTabStore.getState().setPagerScrollEnabled(true);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isMultiSelectMode) return false;
        // Claim horizontal swipe if dragging left (or right to close)
        const isHorizontal =
          Math.abs(gestureState.dx) > 12 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;
        if (!isHorizontal) return false;

        // If closed, only respond to dragging left
        if (!isOpenRef.current && gestureState.dx < -10) return true;
        // If already open, respond to dragging in either direction
        if (isOpenRef.current) return true;

        return false;
      },
      onPanResponderGrant: () => {
        // Temporarily lock parent horizontal tab pager while swiping card
        useTabStore.getState().setPagerScrollEnabled(false);
      },
      onPanResponderMove: (_, gestureState) => {
        if (isMultiSelectMode) return;
        const base = isOpenRef.current ? -85 : 0;
        const nextVal = base + gestureState.dx;
        // Clamp between -200 and 0
        if (nextVal <= 0) {
          translateX.setValue(Math.max(-200, nextVal));
        } else {
          translateX.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        useTabStore.getState().setPagerScrollEnabled(true);
        if (isMultiSelectMode) return;

        const effectiveDx = (isOpenRef.current ? -85 : 0) + gestureState.dx;

        if (effectiveDx < -130 || gestureState.vx < -0.6) {
          // Full swipe -> Slide all the way out and delete
          Animated.timing(translateX, {
            toValue: -400,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            translateX.setValue(0);
            setIsOpen(false);
          });
        } else if (effectiveDx < -45) {
          // Snap open to reveal delete button
          Animated.spring(translateX, {
            toValue: -85,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
          setIsOpen(true);
        } else {
          // Snap back closed
          closeSwipe();
        }
      },
      onPanResponderTerminate: () => {
        useTabStore.getState().setPagerScrollEnabled(true);
        closeSwipe();
      },
    })
  ).current;

  const handleCardPress = () => {
    if (isOpen) {
      closeSwipe();
      return;
    }
    if (isMultiSelectMode) {
      onToggleSelect();
    } else {
      onPress();
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Saved";
    }
  };

  const getCategoryBadgeLabel = (cat: string) => {
    switch (cat) {
      case "lecture":
        return "Lecture";
      case "assignment":
        return "Assignment";
      case "submission":
        return "Submission";
      case "archive":
        return "Archive";
      default:
        return "Document";
    }
  };

  return (
    <View style={styles.container}>
      {/* Hidden Swipe Action Underlay */}
      <View style={styles.underlay}>
        <TouchableOpacity
          style={styles.underlayDeleteBtn}
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
          activeOpacity={0.8}
        >
          <Trash2 size={22} color="#ffffff" />
          <Text style={styles.underlayText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Front Swipeable Card */}
      <Animated.View
        style={[
          styles.card,
          isSelected && styles.cardSelected,
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={handleCardPress}
          onLongPress={onLongPress}
          delayLongPress={220}
          activeOpacity={0.85}
        >
          {/* Multi-Select Checkbox Circle */}
          {isMultiSelectMode && (
            <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
              {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
            </View>
          )}

          {/* File Type Icon */}
          {renderFileIcon(item)}

          {/* File Details */}
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={2}>
              {item.fileName}
            </Text>
            <Text style={styles.fileCourse} numberOfLines={1}>
              {item.courseName || "Bahria University LMS"}
            </Text>
            <View style={styles.fileMetaRow}>
              <View style={styles.catBadge}>
                <Text style={styles.catBadgeText}>{getCategoryBadgeLabel(item.category)}</Text>
              </View>
              <Text style={styles.fileMetaDot}>•</Text>
              <Text style={styles.fileSizeText}>{formatBytes(item.fileSize || 0)}</Text>
              <Text style={styles.fileMetaDot}>•</Text>
              <Text style={styles.fileDateText}>{formatTimestamp(item.downloadedAt)}</Text>
            </View>
          </View>

          {/* Quick Actions (Open, Share, Click Delete) */}
          {!isMultiSelectMode && (
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={onPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ExternalLink size={16} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={onShare}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Share2 size={16} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIconBtnDelete}
                onPress={onDelete}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Trash2 size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  underlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#dc2626",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  underlayDeleteBtn: {
    width: 85,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#dc2626",
  },
  underlayText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorderSubtle,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: "#f0fdf4",
  },
  cardTouchable: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#94a3b8",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  selectCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  fileInfo: {
    flex: 1,
    marginRight: 6,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 18,
  },
  fileCourse: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    flexWrap: "wrap",
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  fileMetaDot: {
    fontSize: 10,
    color: colors.textMuted,
    marginHorizontal: 5,
  },
  fileSizeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  fileDateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  actionIconBtnDelete: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
});
