import { useRouter } from "expo-router"
import { useEffect, useRef } from "react"
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

import type { VocabularyCard } from "./PaperCard"

/**
 * 1 枚の答え。clientReviewId は送り直しでも同じ値を使う（API が冪等）
 */
export type CardAnswer = {
  activeSeconds: number
  clientReviewId: string
  grade: ReviewVocabularyCardRequest["grade"]
  lemma: string
  saveStatus: "failed" | "saved" | "saving"
}

/**
 * 進み具合のマス。覚えたは琥珀、まだはローズの枠、今のカードは白い輪
 */
export function ProgressSquares({ answers, total }: { answers: Pick<CardAnswer, "grade">[], total: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.squares}>
      {Array.from({ length: total }, (_, index) => {
        const grade = answers[index]?.grade
        return (
          <View
            key={index}
            style={[
              styles.square,
              grade === "remembered" && styles.squareRemembered,
              grade === "forgot" && styles.squareForgot,
              grade === undefined && index === answers.length && styles.squareCurrent,
            ]}
          />
        )
      })}
    </View>
  )
}

/**
 * ふりかえり。覚えた / まだの数と、まだの単語の一覧。保存できなかったカードは同じ clientReviewId で送り直せる。
 * 保存中のカードが残っている間は「もう 1 回」を押せない（取り直した 1 回分に、保存前のカードがまた出ないように）。
 * 出たときに読み上げのフォーカスを見出しへ移し、保存できなかったカードが増えたら iOS でも読み上げる（Android は accessibilityLiveRegion）
 */
export function SessionReview({
  answers,
  cards,
  onRestart,
  onRetrySave,
}: {
  answers: CardAnswer[]
  cards: VocabularyCard[]
  onRestart: () => void
  onRetrySave: () => void
}) {
  const router = useRouter()
  const rememberedCount = answers.filter(item => item.grade === "remembered").length
  const forgotCards = cards.filter((_, index) => answers[index]?.grade === "forgot")
  const failedCount = answers.filter(item => item.saveStatus === "failed").length
  const isSaving = answers.some(item => item.saveStatus === "saving")
  const titleRef = useRef<Text>(null)

  /**
   * react-native-web には sendAccessibilityEvent が無いので、iOS / Android だけ
   */
  useEffect(() => {
    if (Platform.OS !== "web" && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, "focus")
  }, [])

  useEffect(() => {
    if (failedCount > 0 && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(`保存できなかったカードが ${failedCount} 枚あります。`)
  }, [failedCount])

  return (
    <View style={styles.review}>
      <Text ref={titleRef} accessibilityRole="header" style={styles.title}>ふりかえり</Text>
      <Text accessibilityLabel={`覚えた ${rememberedCount}、まだ ${answers.length - rememberedCount}`} style={styles.score}>
        <Text style={appStyles.caption}>覚えた  </Text>
        <Text style={styles.remembered}>{rememberedCount}</Text>
        <Text style={styles.slash}>  /  </Text>
        <Text style={styles.forgot}>{answers.length - rememberedCount}</Text>
        <Text style={appStyles.caption}>  まだ</Text>
      </Text>
      <View style={styles.squaresRow}><ProgressSquares answers={answers} total={answers.length} /></View>

      {failedCount > 0 && (
        <View accessibilityLiveRegion="polite" style={styles.failure}>
          <Text style={styles.failureText}>保存できなかったカードが {failedCount} 枚あります。</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetrySave}
            style={({ pressed }) => [styles.failureButton, pressed && styles.failureButtonPressed]}
          >
            <Text style={styles.failureText}>もう一度送る</Text>
          </Pressable>
        </View>
      )}

      {forgotCards.length > 0 && (
        <View style={styles.forgotSection}>
          <Text style={appStyles.sectionTitle}>まだの単語</Text>
          <Text style={[appStyles.caption, styles.forgotLead]}>明日、もう一度出ます。</Text>
          {forgotCards.map(card => (
            <View key={card.lemma} style={styles.forgotRow}>
              <Text style={styles.forgotSurface}>{card.surface}</Text>
              <Text style={styles.forgotMeaning}>{card.meaning_ja}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <PrimaryButton isDisabled={isSaving} label={isSaving ? "保存しています…" : "もう 1 回"} onPress={onRestart} />
        <SecondaryButton label="単語帳のトップへ" onPress={() => router.back()} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
    marginTop: 28,
  },
  failure: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.wrongWash,
    borderColor: "rgba(240, 140, 140, 0.5)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  failureButton: {
    borderColor: "rgba(240, 140, 140, 0.6)",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  failureButtonPressed: {
    backgroundColor: "rgba(240, 140, 140, 0.15)",
  },
  failureText: {
    color: THEME_COLORS.fg,
    flexShrink: 1,
    fontSize: 13,
  },
  forgot: {
    color: THEME_COLORS.fg,
    fontSize: 36,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  forgotLead: {
    marginBottom: 6,
    marginTop: 2,
  },
  forgotMeaning: {
    color: THEME_COLORS.fgMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  forgotRow: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  forgotSection: {
    marginTop: 28,
  },
  forgotSurface: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 16,
    width: 120,
  },
  remembered: {
    color: THEME_COLORS.amber,
    fontSize: 36,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  review: {
    paddingVertical: 16,
  },
  score: {
    marginTop: 8,
    textAlign: "center",
  },
  slash: {
    color: THEME_COLORS.fgFaint,
  },
  square: {
    backgroundColor: THEME_COLORS.heat0,
    borderRadius: 2,
    height: 10,
    width: 10,
  },
  squareCurrent: {
    borderColor: "rgba(221, 226, 234, 0.6)",
    borderWidth: 1,
  },
  squareForgot: {
    backgroundColor: THEME_COLORS.wrongWash,
    borderColor: "rgba(240, 140, 140, 0.7)",
    borderWidth: 1,
  },
  squareRemembered: {
    backgroundColor: THEME_COLORS.amber,
    shadowColor: THEME_COLORS.amber,
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  squares: {
    flexDirection: "row",
    gap: 4,
  },
  squaresRow: {
    alignItems: "center",
    marginTop: 12,
  },
  title: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    textAlign: "center",
  },
})
