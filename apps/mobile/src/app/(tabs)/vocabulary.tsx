import { useFocusEffect } from "@react-navigation/native"
import { useRouter } from "expo-router"
import { Fragment, useCallback, useRef, useState } from "react"
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { GetVocabularySummaryResponse } from "@repo/api-schema"

import { CardStackBehind, PaperSheet, type VocabularyCard } from "@/components/features/vocabulary/PaperCard"
import { SentenceText } from "@/components/features/vocabulary/SentenceText"
import { appStyles } from "@/components/ui/app-styles"
import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { VOCABULARY_INTERVAL_LABELS, VOCABULARY_SESSION_SIZE } from "@/features/vocabulary/vocabulary-session"
import { vocabularyApi } from "@/features/vocabulary/vocabulary.api"
import { formatDayLabel } from "@/libs/format"

type VocabularyTopData = {
  firstCard: VocabularyCard | undefined
  summary: GetVocabularySummaryResponse
}

/**
 * 束になったカードの見本。一番上は今日の 1 枚目の語句と 1 文。今日の分が無ければ「All done.」で薄くする（web と同じ）。
 * 今日の分があるのに 1 枚目を取れなかったときは、何も書いていない紙にする
 */
function DeckPreview({ card, isDimmed }: { card: VocabularyCard | undefined, isDimmed: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.deck, isDimmed && styles.deckDimmed]}>
      <CardStackBehind count={2} />
      <PaperSheet style={styles.deckCard}>
        {isDimmed ? (
          <View style={styles.deckDone}><Text style={styles.deckDoneText}>All done.</Text></View>
        ) : card && (
          <View style={styles.deckBody}>
            <Text style={styles.deckSurface}>{card.surface}</Text>
            {card.sentence && <SentenceText numberOfLines={2} sentence={card.sentence} style={styles.deckSentence} />}
          </View>
        )}
      </PaperSheet>
    </View>
  )
}

function CountStat({ label, unit, value }: { label: string, unit: string, value: number }) {
  return (
    <View>
      <Text style={appStyles.caption}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statUnit}> {unit}</Text>
      </Text>
    </View>
  )
}

/**
 * 単語帳のトップ（タブ）。今日の分がある / 今日の分が終わった / まだ単語が無い、の 3 つの状態で出し分ける（web の VocabularySummaryPanel と同じ）。
 * 1 回分から戻ったときに数が変わるので、フォーカスのたびに取り直す（フォーカス中にアプリが前面に戻ったときも）。
 * 束の見本に今日の 1 枚目を出すため、1 回分も一緒に取る（読み取りだけで何も書き込まない）。1 回分の取得に失敗しても見本の 1 枚目を出さないだけ（web と同じ）
 */
export default function VocabularyScreen() {
  const router = useRouter()
  const [data, setData] = useState<VocabularyTopData | null>(null)
  const [hasError, setHasError] = useState(false)
  /**
   * 取得のたびに進める連番。古い取得の結果が後から届いたら捨てる。
   * 答えた直後に戻ると、保存（POST）より先にこの取得が届き、1 枚分古い数が次に開くまで残ることがある（数は目安なので許容する）
   */
  const requestSeqRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current
    try {
      const [summary, session] = await Promise.all([
        vocabularyApi.getSummary(),
        vocabularyApi.getSession().catch((error: unknown) => {
          console.warn("Failed to fetch the first vocabulary card:", error)
          return null
        }),
      ])
      if (seq !== requestSeqRef.current) return
      setData({ firstCard: session?.cards[0], summary })
      setHasError(false)
    } catch (error) {
      if (seq !== requestSeqRef.current) return
      /**
       * 表示中のデータがあれば残す（エラーの表示は初回の取得に失敗したときだけ）
       */
      console.warn("Failed to fetch vocabulary summary:", error)
      setHasError(true)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void load()
      })
      return () => subscription.remove()
    }, [load]),
  )

  const reload = () => {
    setHasError(false)
    void load()
  }

  const summary = data?.summary
  const todayCount = summary ? Math.min(summary.due_count + summary.new_count, VOCABULARY_SESSION_SIZE) : 0
  const hasAnyWord = summary !== undefined && (todayCount > 0 || summary.learning_count > 0 || summary.mastered_count > 0)

  return (
    <SafeAreaView edges={["top"]} style={appStyles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>単語帳</Text>
      </View>

      {data === null || summary === undefined ? (
        hasError ? (
          <View style={styles.center}>
            <Text style={styles.message}>読み込めませんでした。</Text>
            <View style={styles.reload}>
              <SecondaryButton label="再読み込み" onPress={reload} />
            </View>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={THEME_COLORS.amber} />
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.lead}>長文で出会った単語を、カードをめくって覚えます。</Text>

          {!hasAnyWord ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>まだ単語がありません</Text>
              <Text style={styles.emptyText}>
                問題を解くと、読んだ本文の単語と調べた単語がここに並びます。解答中に単語をタップして意味を調べると、その単語から先に出ます。
              </Text>
              <PrimaryButton label="問題一覧へ" onPress={() => router.navigate("/passages")} />
            </View>
          ) : (
            <>
              <View style={[appStyles.card, styles.today]}>
                <Text style={styles.todayLabel}>今日の分</Text>
                {todayCount > 0 ? (
                  <>
                    <View style={styles.stats}>
                      <CountStat label="今日の復習" unit="枚" value={summary.due_count} />
                      <CountStat label="新しい単語" unit="語" value={summary.new_count} />
                    </View>
                    <DeckPreview card={data.firstCard} isDimmed={false} />
                    {/**
                      * navigate にして、素早く 2 回押しても 1 回分の画面を 2 枚積まない
                      */}
                    <PrimaryButton label={`はじめる（${todayCount} 枚）`} onPress={() => router.navigate("/vocabulary/session")} />
                    <Text style={styles.todayHint}>1〜2 分で終わります。途中でやめても、答えた分は残ります。</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.doneTitle}>今日の分は終わりました</Text>
                    {summary.next_due_date && <Text style={styles.doneLead}>次の復習は {formatDayLabel(summary.next_due_date)} です。</Text>}
                    <DeckPreview card={undefined} isDimmed />
                    <SecondaryButton label="問題を解いて単語を増やす" onPress={() => router.navigate("/passages")} />
                  </>
                )}
              </View>

              <View style={styles.counts}>
                <View style={styles.stats}>
                  <CountStat label="復習中" unit="語" value={summary.learning_count} />
                  <CountStat label="覚えた単語" unit="語" value={summary.mastered_count} />
                </View>
                <Text style={[appStyles.caption, styles.intervalLabel]}>復習の間隔</Text>
                <Text accessibilityLabel={`覚えた、${VOCABULARY_INTERVAL_LABELS.join("、")}、覚えた単語`} style={styles.interval}>
                  覚えた
                  {VOCABULARY_INTERVAL_LABELS.map(label => (
                    <Fragment key={label}>
                      <Text style={styles.arrow}> → </Text>
                      {label}
                    </Fragment>
                  ))}
                  <Text style={styles.arrow}> → </Text>
                  <Text style={styles.mastered}>覚えた単語</Text>
                </Text>
                <Text style={styles.intervalNote}>「まだ」を付けたカードは翌日にもう一度出ます。</Text>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  arrow: {
    color: THEME_COLORS.fgFaint,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  content: {
    gap: 20,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  counts: {
    borderColor: THEME_COLORS.line,
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
  deckDone: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  deckDoneText: {
    color: THEME_COLORS.inkMuted,
    fontFamily: THEME_FONTS.reading,
    fontSize: 18,
    fontStyle: "italic",
  },
  deckSentence: {
    color: THEME_COLORS.inkMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  deckSurface: {
    color: THEME_COLORS.ink,
    fontFamily: THEME_FONTS.readingSemiBold,
    fontSize: 22,
    textAlign: "center",
  },
  doneLead: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  doneTitle: {
    color: THEME_COLORS.fg,
    fontSize: 18,
    fontWeight: "600",
  },
  empty: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  emptyText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyTitle: {
    color: THEME_COLORS.fg,
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  interval: {
    color: THEME_COLORS.fg,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  intervalLabel: {
    marginTop: 18,
  },
  intervalNote: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    marginTop: 4,
  },
  lead: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  mastered: {
    color: THEME_COLORS.amber,
  },
  message: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    textAlign: "center",
  },
  reload: {
    marginTop: 16,
    minWidth: 160,
  },
  statUnit: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    fontWeight: "400",
  },
  statValue: {
    color: THEME_COLORS.fg,
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
    color: THEME_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
  today: {
    gap: 14,
    padding: 18,
  },
  todayHint: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
  },
  todayLabel: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
  },
})
