import { StyleSheet, Text, View } from "react-native"

import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS } from "@/const/design-theme"

/**
 * 期限（開始から 24 時間）を過ぎた挑戦の表示。開いたときに期限切れだった・解答中に過ぎた・提出が期限切れで断られたときに出す。
 * この挑戦はもう提出できないので、問題一覧から新しく始めてもらう
 */
export function ExpiredNotice({ onBackToList }: { onBackToList: () => void }) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>この挑戦は期限切れです</Text>
      <Text style={styles.text}>開始から 24 時間が過ぎたため、この挑戦は提出できません。問題を開くと、新しく挑戦できます。</Text>
      <View style={styles.action}>
        <SecondaryButton label="問題一覧へ" onPress={onBackToList} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  action: {
    marginTop: 20,
    minWidth: 160,
  },
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
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
  },
})
