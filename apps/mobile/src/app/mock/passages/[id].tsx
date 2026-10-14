import { useLocalSearchParams, useRouter } from "expo-router"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { DifficultyMeter, mockStyles, PrimaryButton, SourceMeta } from "@/components/mock/parts"
import { AppBackdrop } from "@/components/ui/AppBackdrop"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import { formatSeconds, MOCK_PASSAGE_LIST } from "@/libs/mock-data"

/**
 * 開始確認（モック）。モーダルで出し、本文はまだ見せない
 */
export default function MockPassageStartScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const isResume = params.state === "resume"
  const passage = MOCK_PASSAGE_LIST[1]

  return (
    <SafeAreaView edges={["top", "bottom"]} style={mockStyles.screen}>
      <AppBackdrop />
      <View style={styles.grabber} />
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Text style={styles.close}>閉じる</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <SourceMeta kind={passage.kind} name={passage.sourceName} />
        <Text style={styles.title}>{passage.title}</Text>

        <View style={styles.facts}>
          <View style={styles.fact}>
            <Text style={mockStyles.caption}>難易度</Text>
            <View style={{ marginTop: 6 }}><DifficultyMeter level={passage.difficulty} /></View>
          </View>
          <View style={styles.fact}>
            <Text style={mockStyles.caption}>英単語数</Text>
            <Text style={styles.factValue}>{passage.wordCount}<Text style={styles.factUnit}> 語</Text></Text>
          </View>
          <View style={styles.fact}>
            <Text style={mockStyles.caption}>制限時間</Text>
            <Text style={styles.factValue}>{formatSeconds(passage.timeLimitSeconds)}</Text>
          </View>
          <View style={styles.fact}>
            <Text style={mockStyles.caption}>設問</Text>
            <Text style={styles.factValue}>{passage.questionCount}<Text style={styles.factUnit}> 問</Text></Text>
          </View>
        </View>

        {isResume ? (
          <View style={styles.resume}>
            <Text style={styles.resumeTitle}>前回の続きから再開できます。</Text>
            <Text style={styles.resumeText}>残り 3:12、回答 2 / 4。あと 18 時間で期限切れになります。</Text>
          </View>
        ) : (
          <View style={{ gap: 6, marginTop: 20 }}>
            <Text style={styles.note}>「開始する」を押すとタイマーが動き、本文が表示されます。</Text>
            <Text style={styles.note}>アプリを閉じている間と一時停止中はタイマーが止まります。</Text>
            <Text style={styles.note}>時間が過ぎても解き続けられます（超過時間が記録されます）。</Text>
          </View>
        )}
        <Text style={styles.attribution}>出典：{passage.sourceName}（MIT / Apache-2.0）。一部を抜粋・改変しています。</Text>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={isResume ? "再開する" : "開始する"} onPress={() => router.replace("/mock/attempts/42")} />
      </View>

      <MockStatePanel
        bottom={96}
        current={isResume ? "resume" : "new"}
        states={[
          { href: "/mock/passages/57", key: "new", label: "新しく始める" },
          { href: "/mock/passages/57?state=resume", key: "resume", label: "挑戦中（再開）" },
        ]}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  attribution: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 24,
  },
  close: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 15,
  },
  content: {
    padding: 20,
  },
  fact: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    width: "50%",
  },
  factUnit: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    fontWeight: "400",
  },
  factValue: {
    color: MOCK_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
    marginTop: 4,
  },
  facts: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: MOCK_COLORS.line,
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 20,
  },
  footer: {
    padding: 16,
  },
  grabber: {
    alignSelf: "center",
    backgroundColor: MOCK_COLORS.lineStrong,
    borderRadius: 2,
    height: 4,
    marginTop: 8,
    width: 40,
  },
  header: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  note: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  resume: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 20,
    padding: 14,
  },
  resumeText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  resumeTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
  },
  title: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.readingSemiBold,
    fontSize: 28,
    lineHeight: 36,
    marginTop: 12,
  },
})
