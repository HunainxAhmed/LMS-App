import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  accentColor?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  accentColor = colors.primary,
  icon,
  onPress,
}) => {
  const content = (
    <>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {icon ? <View style={styles.iconCircle}>{icon}</View> : null}
      </View>
      <Text style={[styles.value, { color: accentColor }]}>{value}</Text>
      {subtext ? (
        <Text style={styles.subtext} numberOfLines={1}>
          {subtext}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.card}>{content}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
    flex: 1,
    minWidth: 140,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  subtext: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
});
