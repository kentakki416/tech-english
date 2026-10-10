import { StyleSheet, Text, View } from "react-native"

import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

/**
 * ロゴ。学習した日を表す「灯ったマス」をブランドの印にする
 */
export function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <View style={styles.wordmarkLamp} />
      <Text style={styles.wordmarkText}>tech-english</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wordmark: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  wordmarkLamp: {
    backgroundColor: THEME_COLORS.amber,
    borderRadius: 3,
    height: 12,
    shadowColor: THEME_COLORS.amber,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    width: 12,
  },
  wordmarkText: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.codeMedium,
    fontSize: 15,
  },
})
