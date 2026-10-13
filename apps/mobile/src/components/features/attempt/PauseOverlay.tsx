import { StyleSheet, Text, View } from "react-native"

import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { THEME_COLORS } from "@/const/design-theme"

/**
 * 一時停止中の表示。本文・設問シート・単語のカードを覆い隠す（透かさない）。上部バーは隠さない（再開のボタンがあるため）
 */
export function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <View accessibilityViewIsModal style={styles.overlay}>
      <View style={styles.lamp} />
      <Text accessibilityRole="header" style={styles.title}>一時停止中</Text>
      <Text style={styles.text}>本文と設問を隠しています。再開するとタイマーが動きます。</Text>
      <View style={styles.action}>
        <PrimaryButton label="再開する" onPress={onResume} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  action: {
    marginTop: 24,
  },
  lamp: {
    backgroundColor: THEME_COLORS.heat0,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    height: 16,
    width: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: THEME_COLORS.canvas,
    justifyContent: "center",
    padding: 32,
    zIndex: 40,
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center",
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 18,
  },
})
