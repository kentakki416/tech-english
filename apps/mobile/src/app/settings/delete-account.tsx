import { Ionicons } from "@expo/vector-icons"
import { useFocusEffect } from "@react-navigation/native"
import { Stack, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DELETE_ACCOUNT_CONFIRMATION_TEXT } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { deleteAccount, finishAccountDeletion } from "@/features/user/account-deletion"

const DELETED_ITEMS = [
  { description: "名前・アイコン・メールアドレス・タイムゾーン・GitHub アカウントとの紐づけ", label: "アカウント情報" },
  { description: "すべての挑戦・回答・調べた単語。カレンダー・連続日数・統計も消えます", label: "学習の記録" },
  { description: "目標の設定", label: "目標" },
  { description: "設定と、この端末に予約された通知", label: "リマインダー" },
]

/**
 * アカウント削除の確認（設定タブの「危険な操作」から開くスタックの画面）。App Store の要件どおり、web に誘導せずアプリ内で完結させる。
 * 削除が成功したら上部バーを消して完了の表示にし、「ログイン画面へ」で初めてログイン状態を変える（Stack.Protected がログイン画面へ移す）
 */
export default function DeleteAccountScreen() {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFailed, setIsFailed] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const isMatched = confirmation.trim() === DELETE_ACCOUNT_CONFIRMATION_TEXT
  const isDeleteDisabled = !isMatched || isSubmitting

  /**
   * 完了の表示中は Android の戻るボタンでも戻らせない（戻った先の画面はトークンが無く読み込めない）
   */
  useFocusEffect(
    useCallback(() => {
      if (!isDone) return undefined
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => true)
      return () => subscription.remove()
    }, [isDone]),
  )

  const handleDelete = async () => {
    setIsSubmitting(true)
    setIsFailed(false)
    try {
      await deleteAccount()
      setIsDone(true)
    } catch (error) {
      /**
       * トークンもデータも消していないので、そのまま再試行できる
       */
      console.warn("Failed to delete account:", error)
      setIsFailed(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      {/**
        * 完了の表示中は iOS のスワイプでも戻らせない
        */}
      <Stack.Screen options={{ gestureEnabled: !isDone }} />
      {!isDone && (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.back}>
            <Ionicons color={THEME_COLORS.fgMuted} name="chevron-back" size={18} />
            <Text style={styles.backText}>設定</Text>
          </Pressable>
        </View>
      )}
      {isDone ? (
        <View style={styles.done}>
          <Text accessibilityRole="header" style={styles.title}>アカウントを削除しました</Text>
          <Text style={styles.body}>学習の記録を含むすべてのデータを削除しました。同じ GitHub アカウントで再びログインすると、新しいアカウントとして始まります。</Text>
          <Text style={styles.body}>GitHub 側の連携は、GitHub の Settings → Applications から解除できます。</Text>
          <View style={styles.doneAction}>
            <SecondaryButton label="ログイン画面へ" onPress={finishAccountDeletion} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.title}>アカウントを削除</Text>
          <Text style={styles.body}>削除はすぐに実行され、取り消せません。次のデータがすべて削除されます。</Text>
          <View style={[appStyles.card, styles.items]}>
            {DELETED_ITEMS.map((item, index) => (
              <View key={item.label} style={[styles.item, index > 0 && styles.itemBorder]}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemText}>{item.description}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.body, styles.prompt]}>
            確認のため <Text style={styles.code}>{DELETE_ACCOUNT_CONFIRMATION_TEXT}</Text> と入力してください
          </Text>
          <TextInput
            accessibilityLabel={`確認のため ${DELETE_ACCOUNT_CONFIRMATION_TEXT} と入力`}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            onChangeText={setConfirmation}
            spellCheck={false}
            style={styles.input}
            value={confirmation}
          />
          {isFailed && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>削除できませんでした。通信状況を確認して、もう一度お試しください。</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isSubmitting, disabled: isDeleteDisabled }}
            disabled={isDeleteDisabled}
            onPress={() => void handleDelete()}
            style={[styles.deleteButton, isDeleteDisabled && styles.deleteButtonDisabled]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={THEME_COLORS.fgFaint} />
            ) : (
              <Text style={[styles.deleteText, isDeleteDisabled && styles.deleteTextDisabled]}>アカウントを削除する</Text>
            )}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.cancel}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    flexDirection: "row",
  },
  backText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  body: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 15,
  },
  code: {
    color: THEME_COLORS.wrong,
    fontFamily: THEME_FONTS.code,
  },
  content: {
    padding: 20,
    paddingBottom: 80,
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.wrong,
    borderRadius: 10,
    height: 48,
    justifyContent: "center",
    marginTop: 20,
  },
  deleteButtonDisabled: {
    backgroundColor: THEME_COLORS.raised,
  },
  deleteText: {
    color: THEME_COLORS.canvas,
    fontSize: 15,
    fontWeight: "700",
  },
  deleteTextDisabled: {
    color: THEME_COLORS.fgFaint,
  },
  done: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  doneAction: {
    marginTop: 24,
  },
  error: {
    color: THEME_COLORS.wrong,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  header: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  input: {
    backgroundColor: THEME_COLORS.canvas,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.code,
    fontSize: 15,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  item: {
    padding: 14,
  },
  itemBorder: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemLabel: {
    color: THEME_COLORS.fg,
    fontSize: 14,
  },
  itemText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  items: {
    marginTop: 16,
  },
  prompt: {
    color: THEME_COLORS.fg,
    marginTop: 24,
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
})
