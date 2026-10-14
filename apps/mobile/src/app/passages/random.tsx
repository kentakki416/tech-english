import { useRouter } from "expo-router"
import { useEffect } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"
import { EMPTY_PASSAGE_FILTER } from "@/features/passage/passage-query"
import { passageApi } from "@/features/passage/passage.api"

/**
 * ランダムに 1 問（web の `/passages/random` と同じ役割）。マイページの「ランダムに 1 問解く」と
 * リマインダーの通知（`techenglish://passages/random`）の入口。絞り込みなしで API に選ばせて開始確認に置き換える。
 * 公開中の問題が無い・取得に失敗したときは問題タブへ戻す（`replace` だとルートのスタックにタブがもう 1 つ積まれるので `dismissTo`。
 * 通知から開いてスタックにタブが無いときは、dismissTo が置き換えにしてくれる）。
 * 静的なルートの `passages/random` は動的な `passages/[id]` より優先して照合される（expo-router の仕様）
 */
export default function RandomPassageScreen() {
  const router = useRouter()

  useEffect(() => {
    let isActive = true
    const pickRandom = async () => {
      try {
        const id = await passageApi.getRandom(EMPTY_PASSAGE_FILTER)
        if (!isActive) return
        if (id === null) {
          router.dismissTo("/passages")
          return
        }
        router.replace({ params: { id: String(id) }, pathname: "/passages/[id]" })
      } catch (error) {
        console.warn("Failed to pick a random passage:", error)
        if (isActive) router.dismissTo("/passages")
      }
    }
    void pickRandom()
    return () => {
      isActive = false
    }
  }, [router])

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={THEME_COLORS.amber} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.canvas,
    flex: 1,
    justifyContent: "center",
  },
})
