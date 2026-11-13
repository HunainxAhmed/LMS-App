import React, { useRef, useState, memo } from "react";
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
import { setPagerScrollEnabledDirect } from "../stores/tabStore";
import { Trash2, Share2, ExternalLink, Check } from "lucide-react-native";

interface SwipeableDownloadCardProps {
  item: DownloadedItem;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  onPress: (item: DownloadedItem) => void;
  onDelete: (item: DownloadedItem) => void;
  onShare: (item: DownloadedItem) => void;
  renderFileIcon: (item: DownloadedItem) => React.ReactNode;
}

const SwipeableDownloadCardComponent: React.FC<SwipeableDownloadCardProps> = ({
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
    setPagerScrollEnabledDirect(true);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        if (isMultiSelectMode) return false;

        const isHorizontal =
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;

        if (!isHorizontal) return false;

        // If closed, only respond to dragging left
        if (!isOpenRef.current && gestureState.dx < -6) return true;
        // If already open, respond to dragging in either direction
        if (isOpenRef.current && Math.abs(gestureState.dx) > 6) return true;

        return false;
      },
      onPanResponderGrant: () => {
        // Direct native scroll disallow with 0 component re-renders
        setPagerScrollEnabledDirect(false);
      },
      onPanResponderMove: (_, gestureState) => {
        if (isMultiSelectMode) return;
        const base = isOpenRef.current ? -90 : 0;
        const nextVal = base + gestureState.dx;
        if (nextVal > 0) {
          translateX.setValue(0);
        } else {
          translateX.setValue(Math.max(-260, nextVal));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setPagerScrollEnabledDirect(true);
        if (isMultiSelectMode) return;

        const effectiveDx = (isOpenRef.current ? -90 : 0) + gestureState.dx;

        if (effectiveDx < -140 || gestureState.vx < -0.5) {
          // Full swipe to delete
          Animated.timing(translateX, {
            toValue: -500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onDelete(item);
            translateX.setValue(0);
            setIsOpen(false);
          });
        } else if (effectiveDx < -45) {
          // Snap open to reveal delete button
          Animated.spring(translateX, {
            toValue: -90,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
          setIsOpen(true);
        } else {
          // Snap closed
          closeSwipe();
        }
      },
      onPanResponderTerminate: () => {
        setPagerScrollEnabledDirect(true);
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
      onToggleSelect(item.id);
    } else {
      onPress(item);
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
            onDelete(item);
          }}
          activeOpacity={0.8}
        >
          <Trash2 size={20} color="#ffffff" strokeWidth={2.4} />
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
          onLongPress={() => onLongPress(item.id)}
          delayLongPress={280}
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
                onPress={() => onPress(item)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <ExternalLink size={16} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={() => onShare(item)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Share2 size={16} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIconBtnDelete}
                onPress={() => onDelete(item)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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

export const SwipeableDownloadCard = memo(
  SwipeableDownloadCardComponent,
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.fileSize === next.item.fileSize &&
      prev.isMultiSelectMode === next.isMultiSelectMode &&
      prev.isSelected === next.isSelected
    );
  }
);

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
    backgroundColor: "#ef4444",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  underlayDeleteBtn: {
    width: 90,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ef4444",
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
    borderWidth: 1.5,
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
    fontWeight: "600",
    color: colors.textSecondary,
  },
  fileMetaDot: {
    fontSize: 10,
    color: colors.textMuted,
    marginHorizontal: 5,
  },
  fileSizeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  fileDateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  actionIconBtnDelete: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
});
