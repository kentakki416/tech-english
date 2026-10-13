import { useLocalSearchParams, useRouter } from "expo-router"
import { StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { appStyles } from "@/components/ui/app-styles"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { useAttemptStore } from "@/features/attempt/attempt.store"

/**
 * 解答画面（仮）。本文・設問・タイマーは reading-practice step9 で作る。
 * 開始確認が入れた挑戦（attempt.store）があればタイトルだけ出す
 */
export default function AttemptScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const attempt = useAttemptStore((state) => state.attemptsById[Number(params.id)])

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      <View style={styles.content}>
        {attempt && <Text style={styles.title}>{attempt.passage.title}</Text>}
        <Text style={styles.message}>解答画面は準備中です。</Text>
        <View style={styles.action}>
          <SecondaryButton label="問題一覧へ" onPress={() => router.dismissTo("/passages")} />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  action: {
    marginTop: 20,
    minWidth: 160,
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  message: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    marginTop: 8,
  },
  title: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.readingSemiBold,
    fontSize: 22,
    lineHeight: 30,
    textAlign: "center",
  },
})
