import { type Href, useLocalSearchParams, useRouter } from "expo-router"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { CardStackBehind, PaperSheet, SentenceText } from "@/components/mock/PaperCard"
import { mockStyles, PrimaryButton, SecondaryButton } from "@/components/mock/parts"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import { MOCK_VOCABULARY_CARDS, MOCK_VOCABULARY_SESSION_SIZE, MOCK_VOCABULARY_SUMMARY } from "@/libs/mock-data"

const STATES: { href: Href, key: string, label: string }[] = [
  { href: "/mock/vocabulary", key: "normal", label: "今日の分がある" },
  { href: "/mock/vocabulary?state=done", key: "done", label: "今日の分が終わった" },
  { href: "/mock/vocabulary?state=empty", key: "empty", label: "まだ単語が無い" },
]

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

const formatDayLabel = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

/**
 * 束になったカードの見本（一番上は今日の 1 枚目の表）
 */
function DeckPreview({ isDimmed }: { isDimmed: boolean }) {
  const card = MOCK_VOCABULARY_CARDS[0]
  return (
    <View style={[styles.deck, isDimmed && styles.deckDimmed]}>
      <CardStackBehind count={2} />
      <PaperSheet style={styles.deckCard}>
        <View style={styles.deckBody}>
          <Text style={styles.deckSurface}>{card.surface}</Text>
          {card.sentence && <SentenceText numberOfLines={2} sentence={card.sentence} style={styles.deckSentence} />}
        </View>
      </PaperSheet>
    </View>
  )
}

function CountStat({ label, unit, value }: { label: string, unit: string, value: number }) {
  return (
    <View>
      <Text style={mockStyles.caption}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statUnit}> {unit}</Text>
      </Text>
    </View>
  )
}

/**
 * 単語帳のトップ（モック・タブ）
 */
export default function MockVocabularyScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const current = STATES.find(item => item.key === params.state)?.key ?? "normal"
  const summary = current === "done"
    ? { ...MOCK_VOCABULARY_SUMMARY, dueCount: 0, newCount: 0 }
    : current === "empty"
      ? { ...MOCK_VOCABULARY_SUMMARY, dueCount: 0, learningCount: 0, masteredCount: 0, newCount: 0 }
      : MOCK_VOCABULARY_SUMMARY
  const todayCount = Math.min(summary.dueCount + summary.newCount, MOCK_VOCABULARY_SESSION_SIZE)

  return (
    <SafeAreaView edges={["top"]} style={mockStyles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>単語帳</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>長文で出会った単語を、カードをめくって覚えます。</Text>

        {current === "empty" ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>まだ単語がありません</Text>
            <Text style={styles.emptyText}>問題を解くと、読んだ本文の単語と調べた単語がここに並びます。解答中に単語をタップして意味を調べると、その単語から先に出ます。</Text>
            <PrimaryButton label="問題一覧へ" onPress={() => router.push("/mock/passages")} />
          </View>
        ) : (
          <View style={[mockStyles.card, styles.today]}>
            <Text style={styles.todayLabel}>今日の分</Text>
            {todayCount > 0 ? (
              <>
                <View style={styles.stats}>
                  <CountStat label="今日の復習" unit="枚" value={summary.dueCount} />
                  <CountStat label="新しい単語" unit="語" value={summary.newCount} />
                </View>
                <DeckPreview isDimmed={false} />
                <PrimaryButton label={`はじめる（${todayCount} 枚）`} onPress={() => router.push("/mock/vocabulary/session")} />
                <Text style={styles.todayHint}>1〜2 分で終わります。途中でやめても、答えた分は残ります。</Text>
              </>
            ) : (
              <>
                <Text style={styles.doneTitle}>今日の分は終わりました</Text>
                <Text style={styles.doneLead}>次の復習は {formatDayLabel(summary.nextDueDate)} です。</Text>
                <DeckPreview isDimmed />
                <SecondaryButton label="問題を解いて単語を増やす" onPress={() => router.push("/mock/passages")} />
              </>
            )}
          </View>
        )}

        {current !== "empty" && (
          <View style={styles.counts}>
            <View style={styles.stats}>
              <CountStat label="復習中" unit="語" value={summary.learningCount} />
              <CountStat label="覚えた単語" unit="語" value={summary.masteredCount} />
            </View>
            <Text style={[mockStyles.caption, styles.intervalLabel]}>復習の間隔</Text>
            <Text style={styles.interval}>
              覚えた <Text style={styles.arrow}>→</Text> 3 日後 <Text style={styles.arrow}>→</Text> 7 日後 <Text style={styles.arrow}>→</Text> 30 日後 <Text style={styles.arrow}>→</Text> <Text style={styles.mastered}>覚えた単語</Text>
            </Text>
            <Text style={styles.intervalNote}>「まだ」を付けたカードは翌日にもう一度出ます。</Text>
          </View>
        )}
      </ScrollView>
      <MockStatePanel current={current} states={STATES} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  arrow: {
    color: MOCK_COLORS.fgFaint,
  },
  content: {
    gap: 20,
    paddingBottom: 140,
    paddingHorizontal: 16,
  },
  counts: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
  },
  deck: {
    alignSelf: "center",
    height: 150,
    marginBottom: 26,
    marginTop: 4,
    transform: [{ rotate: "-2deg" }],
    width: 250,
  },
  deckBody: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  deckCard: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  deckDimmed: {
    opacity: 0.45,
  },
  deckSentence: {
    color: MOCK_COLORS.inkMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  deckSurface: {
    color: MOCK_COLORS.ink,
    fontFamily: MOCK_FONTS.readingSemiBold,
    fontSize: 22,
    textAlign: "center",
  },
  doneLead: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  doneTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 18,
    fontWeight: "600",
  },
  empty: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  emptyText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  interval: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  intervalLabel: {
    marginTop: 18,
  },
  intervalNote: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
    marginTop: 4,
  },
  lead: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  mastered: {
    color: MOCK_COLORS.amber,
  },
  statUnit: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    fontWeight: "400",
  },
  statValue: {
    color: MOCK_COLORS.fg,
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    marginTop: 2,
  },
  stats: {
    flexDirection: "row",
    gap: 32,
  },
  title: {
    color: MOCK_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
  today: {
    gap: 14,
    padding: 18,
  },
  todayHint: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
  },
  todayLabel: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
  },
})
