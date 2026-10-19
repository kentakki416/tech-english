import { Ionicons } from "@expo/vector-icons"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { appStyles } from "@/components/ui/app-styles"
import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { SoundEffectToggle } from "@/components/ui/SoundEffectToggle"
import { THEME_COLORS } from "@/const/design-theme"
import { useSoundEffects } from "@/features/sound-effect/use-sound-effects"
import { usePronunciation } from "@/features/vocabulary/use-pronunciation"
import { vocabularyApi } from "@/features/vocabulary/vocabulary.api"
import { formatDayLabel } from "@/libs/format"

import { FlashCard } from "./FlashCard"
import { CardStackBehind, PaperSheet, type VocabularyCard } from "./PaperCard"
import { type CardAnswer, ProgressSquares, SessionReview } from "./SessionReview"

/**
 * 上部バーの左（「‹ 単語帳」）と右（効果音）の幅。進み具合を中央に置くため左右で揃える
 */
const HEADER_SIDE_WIDTH = 100

/**
 * 1 回分の上部バー（「‹ 単語帳」・進み具合・効果音）。読み込み中は進み具合と効果音を出さない
 */
export function SessionTopBar({
  answeredCount,
  sound,
  total,
}: {
  answeredCount: number
  sound?: { isEnabled: boolean, toggle: () => void }
  total: number
}) {
  const router = useRouter()
  const position = Math.min(answeredCount + 1, total)
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.back}>
        <Ionicons color={THEME_COLORS.fgMuted} name="chevron-back" size={18} />
        <Text style={styles.backText}>単語帳</Text>
      </Pressable>
      {total > 0 ? (
        <Text accessibilityLabel={`${total} 枚中 ${position} 枚目`} style={styles.count}>
          {position}
          <Text style={styles.countTotal}> / {total}</Text>
        </Text>
      ) : <View />}
      <View style={styles.headerRight}>
        {sound && <SoundEffectToggle isEnabled={sound.isEnabled} onToggle={sound.toggle} />}
      </View>
    </View>
  )
}

/**
 * 今日の分が無いとき（カードが 0 枚で開いた）
 */
function SessionDone({ nextDueDate }: { nextDueDate: string | null }) {
  const router = useRouter()
  return (
    <View style={styles.done}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.doneDeck}>
        <CardStackBehind count={2} />
        <PaperSheet style={styles.doneCard}>
          <View style={styles.doneCardBody}><Text style={styles.doneCardText}>All done.</Text></View>
        </PaperSheet>
      </View>
      <Text accessibilityRole="header" style={styles.doneTitle}>今日の分は終わりました</Text>
      <Text style={styles.doneLead}>
        {nextDueDate && `次の復習は ${formatDayLabel(nextDueDate)} です。`}
        問題を解くと、新しい単語が増えます。
      </Text>
      <View style={styles.doneActions}>
        {/**
          * 1 回分はタブの上に積んだスタックなので、dismissTo で問題のタブへ戻る
          */}
        <PrimaryButton label="問題を解く" onPress={() => router.dismissTo("/passages")} />
        <SecondaryButton label="単語帳のトップへ" onPress={() => router.back()} />
      </View>
    </View>
  )
}

/**
 * 単語帳の 1 回分（vocabulary-cards README「UI 設計 > 1 回分」）。カードをめくって覚えた / まだを付け、全部答えるとふりかえり。
 *
 * 答えたら保存を待たずに次のカードへ進む。保存は 1 枚ずつ行い、失敗したカードはふりかえりで同じ clientReviewId で送り直せる。
 * 「もう 1 回」は親が 1 回分を取り直す（取り直している間はこのコンポーネントを外すので、前の回の state を持ち越さない）
 */
export function VocabularySession({
  cards,
  nextDueDate,
  onRestart,
}: {
  cards: VocabularyCard[]
  nextDueDate: string | null
  onRestart: () => void
}) {
  const [answers, setAnswers] = useState<CardAnswer[]>([])
  const isReducedMotion = useReducedMotion()
  const sound = useSoundEffects()
  const pronunciation = usePronunciation()
  const current = cards[answers.length]

  const save = async (target: CardAnswer) => {
    let status: CardAnswer["saveStatus"] = "saved"
    try {
      await vocabularyApi.review({
        active_seconds: target.activeSeconds,
        client_review_id: target.clientReviewId,
        grade: target.grade,
        lemma: target.lemma,
      })
    } catch (error) {
      console.warn("Failed to save vocabulary review:", error)
      status = "failed"
    }
    setAnswers(previous => previous.map(item => (item.clientReviewId === target.clientReviewId ? { ...item, saveStatus: status } : item)))
  }

  const answer = (grade: CardAnswer["grade"], activeSeconds: number) => {
    if (!current) return
    const next: CardAnswer = { activeSeconds, clientReviewId: Crypto.randomUUID(), grade, lemma: current.lemma, saveStatus: "saving" }
    setAnswers(previous => [...previous, next])
    void save(next)
  }

  const retryFailed = () => {
    const failed = answers.filter(item => item.saveStatus === "failed")
    setAnswers(previous => previous.map(item => (item.saveStatus === "failed" ? { ...item, saveStatus: "saving" } : item)))
    for (const item of failed) void save(item)
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      <SessionTopBar answeredCount={answers.length} sound={sound} total={cards.length} />
      {cards.length === 0 ? (
        <View style={styles.body}>
          <SessionDone nextDueDate={nextDueDate} />
        </View>
      ) : current ? (
        <>
          <View style={styles.progress}><ProgressSquares answers={answers} total={cards.length} /></View>
          <View style={styles.body}>
            <FlashCard
              key={current.lemma}
              card={current}
              isFirst={answers.length === 0}
              isReducedMotion={isReducedMotion}
              position={answers.length + 1}
              pronunciation={pronunciation}
              remainingCount={cards.length - answers.length - 1}
              total={cards.length}
              onAnswer={answer}
              onFlip={sound.playFlip}
            />
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.reviewContent}>
          <SessionReview answers={answers} cards={cards} onRestart={onRestart} onRetrySave={retryFailed} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    flexDirection: "row",
    width: HEADER_SIDE_WIDTH,
  },
  backText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  count: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  countTotal: {
    color: THEME_COLORS.fgFaint,
  },
  done: {
    alignItems: "center",
    gap: 10,
  },
  doneActions: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 18,
  },
  doneCard: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  doneCardBody: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  doneCardText: {
    color: THEME_COLORS.inkMuted,
    fontSize: 18,
    fontStyle: "italic",
  },
  doneDeck: {
    height: 140,
    marginBottom: 24,
    width: 220,
  },
  doneLead: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  doneTitle: {
    color: THEME_COLORS.fg,
    fontSize: 18,
    fontWeight: "600",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  headerRight: {
    alignItems: "flex-end",
    width: HEADER_SIDE_WIDTH,
  },
  progress: {
    alignItems: "center",
    paddingTop: 4,
  },
  reviewContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
})
