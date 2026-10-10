import { type Href, useRouter } from "expo-router"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { mockStyles, Wordmark } from "@/components/mock/parts"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"

const SCREENS: { href: Href, spec: string, states?: { href: Href, label: string }[], title: string }[] = [
  { href: "/mock/sign-in", spec: "github-auth", title: "ログイン" },
  { href: "/mock/home", spec: "learning-record", states: [{ href: "/mock/home?state=empty", label: "まだ 1 問も解いていない" }], title: "マイページ（タブ）" },
  { href: "/mock/passages", spec: "reading-practice", states: [{ href: "/mock/passages?state=no-results", label: "絞り込み結果が 0 件" }], title: "問題一覧（タブ）" },
  { href: "/mock/passages/57", spec: "reading-practice", states: [{ href: "/mock/passages/57?state=resume", label: "挑戦中（再開）" }], title: "開始確認（モーダル）" },
  {
    href: "/mock/attempts/42",
    spec: "reading-practice",
    states: [
      { href: "/mock/attempts/42?state=peek", label: "長押しの和訳" },
      { href: "/mock/attempts/42?state=sheet", label: "設問を開く" },
      { href: "/mock/attempts/42?state=overtime", label: "時間超過" },
      { href: "/mock/attempts/42?state=paused", label: "一時停止" },
      { href: "/mock/attempts/42?state=confirm", label: "提出確認" },
    ],
    title: "問題を解く",
  },
  { href: "/mock/attempts/42/result", spec: "reading-practice", states: [{ href: "/mock/attempts/42/result?state=overtime", label: "時間超過" }], title: "結果・解説" },
  { href: "/mock/history", spec: "learning-record", title: "学習履歴" },
  { href: "/mock/settings", spec: "learning-record / study-reminder", states: [{ href: "/mock/settings?state=denied", label: "通知が許可されていない" }], title: "設定（タブ）" },
  { href: "/mock/delete-account", spec: "github-auth", states: [{ href: "/mock/delete-account?state=done", label: "削除完了" }], title: "アカウント削除" },
]

/**
 * mobile モックの画面一覧（レビュー用。製品の画面ではない）
 */
export default function MockIndexScreen() {
  const router = useRouter()
  return (
    <SafeAreaView edges={["top"]} style={mockStyles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Wordmark />
        <Text style={styles.title}>画面モック（mobile）</Text>
        <Text style={styles.lead}>ダミーデータで動き、API は呼びません。各画面の下の「モック」から状態を切り替えられます。</Text>
        {SCREENS.map(screen => (
          <View key={String(screen.href)} style={styles.row}>
            <Pressable onPress={() => router.push(screen.href)}>
              <Text style={styles.screenTitle}>{screen.title}</Text>
            </Pressable>
            <Text style={styles.spec}>{screen.spec}</Text>
            {screen.states && (
              <View style={styles.states}>
                {screen.states.map(state => (
                  <Pressable key={state.label} onPress={() => router.push(state.href)} style={styles.state}>
                    <Text style={styles.stateText}>{state.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  lead: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
    marginTop: 6,
  },
  row: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  screenTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 16,
    fontWeight: "500",
  },
  spec: {
    color: MOCK_COLORS.fgFaint,
    fontFamily: MOCK_FONTS.code,
    fontSize: 11,
    marginTop: 2,
  },
  state: {
    borderColor: MOCK_COLORS.line,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stateText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
  },
  states: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  title: {
    color: MOCK_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
    marginTop: 24,
  },
})
