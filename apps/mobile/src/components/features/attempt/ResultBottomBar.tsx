import { useRouter } from "expo-router"
import { useRef, useState } from "react"
import { Alert, StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS } from "@/const/design-theme"
import { EMPTY_PASSAGE_FILTER } from "@/features/passage/passage-query"
import { passageApi } from "@/features/passage/passage.api"

/**
 * 結果画面の下端に固定する操作。「もう一度解く」（副）は同じ問題の開始確認、
 * 「次の問題を解く」（主要）は絞り込みなしで API に 1 問選ばせてその開始確認を開く（新しい挑戦は開始確認から始める）
 */
export function ResultBottomBar({ passageId }: { passageId: number }) {
  const router = useRouter()
  const [isPicking, setIsPicking] = useState(false)
  /**
   * 再描画を待たずに二重に押せないようにする
   */
  const isPickingRef = useRef(false)

  const retry = () => router.push(`/passages/${passageId}`)

  /**
   * finally を使わない（React Compiler が try / finally の関数を含むコンポーネントを最適化しないため）
   */
  const openNextPassage = async () => {
    if (isPickingRef.current) return
    isPickingRef.current = true
    setIsPicking(true)
    try {
      const id = await passageApi.getRandom(EMPTY_PASSAGE_FILTER)
      if (id === null) Alert.alert("問題がありません", "解ける問題が見つかりませんでした。")
      else router.push(`/passages/${id}`)
    } catch (error) {
      console.warn("Failed to pick a random passage:", error)
      Alert.alert("問題を選べませんでした", "時間をおいて再度お試しください。")
    }
    isPickingRef.current = false
    setIsPicking(false)
  }

  return (
    <SafeAreaView edges={{ bottom: "maximum" }} style={styles.bar}>
      <View style={styles.button}>
        <SecondaryButton label="もう一度解く" onPress={retry} />
      </View>
      <View style={styles.button}>
        <PrimaryButton isDisabled={isPicking} label="次の問題を解く" onPress={openNextPassage} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "rgba(24, 29, 40, 0.97)",
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    /**
     * ホームインジケーターの無い端末でも下に余白を残す（edges の maximum で、safe area の方が大きければそちらを使う）
     */
    paddingBottom: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  button: {
    flex: 1,
  },
})
