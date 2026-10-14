import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 結果画面の上部バー（「‹ 問題一覧」と「マイページへ」。どちらも控えめ）。
 * 結果画面はタブの上のスタックに積まれているので、スタックにあるタブまで戻してそのタブを開く
 * （replace だとタブがスタックに 2 つ積まれる）
 */
export function ResultTopBar() {
  const router = useRouter()

  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" hitSlop={8} style={styles.back} onPress={() => router.dismissTo("/passages")}>
        <Ionicons color={THEME_COLORS.fgMuted} name="chevron-back" size={18} />
        <Text style={styles.text}>問題一覧</Text>
      </Pressable>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.dismissTo("/")}>
        <Text style={styles.text}>マイページへ</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  bar: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_COLORS.line,
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
})
