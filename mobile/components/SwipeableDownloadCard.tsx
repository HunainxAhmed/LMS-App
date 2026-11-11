import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Platform,
} from "react-native";
import { colors } from "../theme/colors";
import { DownloadedItem, formatBytes } from "../services/downloadsRegistry";
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

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isMultiSelectMode) return false;
        // Only trigger horizontal swipe if dragging left significantly
        return gestureState.dx < -15 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderMove: (_, gestureState) => {
        if (isMultiSelectMode) return;
        if (gestureState.dx <= 0) {
          translateX.setValue(Math.max(-160, gestureState.dx));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isMultiSelectMode) return;
        if (gestureState.dx < -110) {
          // Swiped all the way -> slide out & delete
          Animated.timing(translateX, {
            toValue: -400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            translateX.setValue(0);
            setIsOpen(false);
          });
        } else if (gestureState.dx < -50) {
          // Snap open reveal
          Animated.spring(translateX, {
            toValue: -80,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
          setIsOpen(true);
        } else {
          // Snap closed
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
          setIsOpen(false);
        }
      },
    })
  ).current;

  const closeSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
    setIsOpen(false);
  };

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
          <Trash2 size={20} color="#ffffff" />
          <Text style={styles.underlayText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Front Swipable Card */}
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
          delayLongPress={300}
          activeOpacity={0.85}
        >
          {/* Multi-Select Checkbox Circle */}
          {isMultiSelectMode && (
            <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
              {isSelected && <Check size={13} color="#ffffff" strokeWidth={3} />}
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
                <Trash2 size={16} color="#e11d48" />
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
    backgroundColor: "#e11d48",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  underlayDeleteBtn: {
    width: 80,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  underlayText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.07)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: "#f0fdf4",
  },
  cardTouchable: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#94a3b8",
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  selectCircleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  fileInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 19,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  fileCourse: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 6,
  },
  fileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
  },
  catBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fileMetaDot: {
    fontSize: 10,
    color: "#cbd5e1",
  },
  fileSizeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  fileDateText: {
    fontSize: 10.5,
    color: "#94a3b8",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  actionIconBtnDelete: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
});
