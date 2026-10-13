import { useRouter } from "expo-router"
import { StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { appStyles } from "@/components/ui/app-styles"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS } from "@/const/design-theme"

/**
 * 結果・解説（仮）。reading-practice step10 で作る
 */
export default function AttemptResultScreen() {
  const router = useRouter()

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      <View style={styles.content}>
        <Text style={styles.message}>結果画面は準備中です。</Text>
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
  },
})
