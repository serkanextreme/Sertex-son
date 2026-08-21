// Lightweight HUD header — a "sade başlık" replacing the web's heavy 3D
// holographic sphere. A small glowing cyan orb keeps the brand feel without
// any per-frame animation cost on device.

import { StyleSheet, Text, View } from "react-native";

import { colors, monoFont, spacing } from "@/src/theme/colors";

type Props = {
  subtitle?: string;
  right?: React.ReactNode;
};

export const HudHeader = ({ subtitle, right }: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.orbWrap}>
          <View style={styles.orbGlow} />
          <View style={styles.orb} />
        </View>
        <View>
          <Text style={styles.brand}>SERTEX</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  orbWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  orbGlow: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.glow,
    opacity: 0.55,
  },
  orb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: "rgba(226, 241, 255, 0.6)",
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 6,
    fontFamily: monoFont,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 2,
    fontFamily: monoFont,
    textTransform: "uppercase",
  },
});
