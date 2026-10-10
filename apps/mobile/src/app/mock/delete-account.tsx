import { Ionicons } from "@expo/vector-icons"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { mockStyles, SecondaryButton } from "@/components/mock/parts"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"

const CONFIRMATION_TEXT = "delete my account"

const DELETED_ITEMS = [
  { description: "名前・アイコン・メールアドレス・タイムゾーン・GitHub アカウントとの紐づけ", label: "アカウント情報" },
  { description: "すべての挑戦・回答・調べた単語。カレンダー・連続日数・統計も消えます", label: "学習の記録" },
  { description: "目標の設定", label: "目標" },
  { description: "設定と、この端末に予約された通知", label: "リマインダー" },
]

/**
 * アカウント削除の確認（モック）。App Store の要件どおり、web に誘導せずアプリ内で完結させる
 */
export default function MockDeleteAccountScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const [confirmation, setConfirmation] = useState("")
  const [isDone, setIsDone] = useState(params.state === "done")
  const isMatched = confirmation.trim() === CONFIRMATION_TEXT

  return (
    <SafeAreaView edges={["top", "bottom"]} style={mockStyles.screen}>
      {!isDone && (
        <View style={styles.header}>
          <Pressable hitSlop={8} onPress={() => router.back()} style={styles.back}>
            <Ionicons color={MOCK_COLORS.fgMuted} name="chevron-back" size={18} />
            <Text style={styles.backText}>設定</Text>
          </Pressable>
        </View>
      )}
      {isDone ? (
        <View style={styles.done}>
          <Text style={styles.title}>アカウントを削除しました</Text>
          <Text style={styles.body}>学習の記録を含むすべてのデータを削除しました。同じ GitHub アカウントで再びログインすると、新しいアカウントとして始まります。</Text>
          <Text style={styles.body}>GitHub 側の連携は、GitHub の Settings → Applications から解除できます。</Text>
          <View style={{ marginTop: 24 }}><SecondaryButton label="ログイン画面へ" onPress={() => router.replace("/mock/sign-in")} /></View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>アカウントを削除</Text>
          <Text style={styles.body}>削除はすぐに実行され、取り消せません。次のデータがすべて削除されます。</Text>
          <View style={[mockStyles.card, { marginTop: 16 }]}>
            {DELETED_ITEMS.map((item, index) => (
              <View key={item.label} style={[styles.item, index > 0 && styles.itemBorder]}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemText}>{item.description}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.body, { color: MOCK_COLORS.fg, marginTop: 24 }]}>
            確認のため <Text style={styles.code}>{CONFIRMATION_TEXT}</Text> と入力してください
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setConfirmation}
            style={styles.input}
            value={confirmation}
          />
          <Pressable
            disabled={!isMatched}
            onPress={() => setIsDone(true)}
            style={[styles.deleteButton, !isMatched && styles.deleteButtonDisabled]}
          >
            <Text style={[styles.deleteText, !isMatched && { color: MOCK_COLORS.fgFaint }]}>アカウントを削除する</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.cancel}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </Pressable>
        </ScrollView>
      )}

      <MockStatePanel
        bottom={24}
        current={isDone ? "done" : "confirm"}
        states={[
          { href: "/mock/delete-account", key: "confirm", label: "確認" },
          { href: "/mock/delete-account?state=done", key: "done", label: "削除完了" },
        ]}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    flexDirection: "row",
  },
  backText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  body: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 15,
  },
  code: {
    color: MOCK_COLORS.wrong,
    fontFamily: MOCK_FONTS.code,
  },
  content: {
    padding: 20,
    paddingBottom: 80,
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.wrong,
    borderRadius: 10,
    height: 48,
    justifyContent: "center",
    marginTop: 20,
  },
  deleteButtonDisabled: {
    backgroundColor: MOCK_COLORS.raised,
  },
  deleteText: {
    color: MOCK_COLORS.canvas,
    fontSize: 15,
    fontWeight: "700",
  },
  done: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  input: {
    backgroundColor: MOCK_COLORS.canvas,
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.code,
    fontSize: 15,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  item: {
    padding: 14,
  },
  itemBorder: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemLabel: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
  },
  itemText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  title: {
    color: MOCK_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
})
