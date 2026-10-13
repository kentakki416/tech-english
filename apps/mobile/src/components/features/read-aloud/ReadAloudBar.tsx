import { Ionicons } from "@expo/vector-icons"
import { useMemo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import type { AttemptBlock } from "@repo/api-schema"

import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import type { ReadAloudRate } from "@/features/read-aloud/read-aloud-rate"
import type { ReadAloudAvailability, ReadAloudPlayback } from "@/features/read-aloud/use-read-aloud"

/**
 * ミニプレーヤーの高さ（docs/spec/read-aloud/README.md「見た目の決まり」）
 */
export const READ_ALOUD_BAR_HEIGHT = 52

/**
 * ミニプレーヤーと、下の区画（閉じた設問シート・結果画面の下端の操作）・上の単語のカードとの間
 */
export const READ_ALOUD_BAR_GAP = 12

/**
 * ミニプレーヤーが本文の下端で占める高さ（下の間 + 高さ + 上の間）。本文の下の余白と単語のカードの位置に足す
 */
export const READ_ALOUD_BAR_SPACE = READ_ALOUD_BAR_GAP + READ_ALOUD_BAR_HEIGHT + READ_ALOUD_BAR_GAP

/**
 * 準備中・失敗の文言（再生ボタン・停止・速度は出さない）
 */
const UNAVAILABLE_MESSAGES: Record<Extract<ReadAloudAvailability, "failed" | "pending">, string> = {
  failed: "この問題の読み上げは利用できません",
  pending: "読み上げの音声を準備中です",
}

/**
 * 本文の下端（解答画面は閉じた設問シートの上、結果画面は下端の操作の上）に浮かべる読み上げのミニプレーヤー（再生・停止・速度）。
 * 待機中は「全文を読み上げ」、再生中・一時停止中は読み上げ中の位置（段落番号の列と同じ番号）と全文 / この段落だけ。
 * 速度はメニューを開かず、押すたびに切り替わる
 */
export function ReadAloudBar({
  availability,
  blocks,
  playback,
  progress,
  rate,
  onRateCycle,
  onStop,
  onToggle,
}: {
  availability: ReadAloudAvailability
  blocks: AttemptBlock[]
  playback: ReadAloudPlayback | null
  progress: number
  rate: ReadAloudRate
  onRateCycle: () => void
  onStop: () => void
  onToggle: () => void
}) {
  const paragraphCount = useMemo(() => blocks.filter(block => block.paragraph_number !== null).length, [blocks])

  if (availability === "pending" || availability === "failed") {
    return (
      <View style={[styles.bar, styles.barUnavailable]}>
        <View style={[styles.playButton, styles.playButtonUnavailable]}>
          <Ionicons color={THEME_COLORS.fgFaint} name="play" size={14} style={styles.playIcon} />
        </View>
        <Text style={styles.unavailableText}>{UNAVAILABLE_MESSAGES[availability]}</Text>
      </View>
    )
  }

  const isActive = playback !== null
  const isPlaying = playback?.isPlaying ?? false
  const isLoading = availability === "loading"
  const paragraphNumber = playback ? (blocks[playback.blockIndex]?.paragraph_number ?? null) : null
  const label = availability === "error"
    ? "読み上げを読み込めませんでした"
    : !isActive
      ? "全文を読み上げ"
      : paragraphNumber === null
        ? "見出し"
        : `段落 ${paragraphNumber} / ${paragraphCount}`

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityLabel={isPlaying ? "読み上げを一時停止" : isActive ? "読み上げを再開" : "全文を読み上げ"}
        accessibilityRole="button"
        accessibilityState={{ disabled: isLoading }}
        disabled={isLoading}
        style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed, isLoading && styles.playButtonLoading]}
        onPress={onToggle}
      >
        <Ionicons color={THEME_COLORS.amberInk} name={isPlaying ? "pause" : "play"} size={14} style={isPlaying ? undefined : styles.playIcon} />
      </Pressable>

      <View style={styles.labels}>
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        {isActive && <Text style={styles.subLabel}>{playback.mode === "all" ? "全文" : "この段落だけ"}</Text>}
      </View>

      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>

      {isActive && (
        <Pressable accessibilityLabel="読み上げを停止" accessibilityRole="button" hitSlop={6} style={styles.stopButton} onPress={onStop}>
          <Ionicons color={THEME_COLORS.fgMuted} name="stop" size={13} />
        </Pressable>
      )}
      <Pressable
        accessibilityLabel={`再生速度 ${rate} 倍。押すと切り替え`}
        accessibilityRole="button"
        hitSlop={6}
        style={styles.rateButton}
        onPress={onRateCycle}
      >
        <Text style={styles.rateText}>{rate}x</Text>
      </Pressable>
    </View>
  )
}

/**
 * 自動スクロールを止めた後に、ミニプレーヤーの上に出す「読み上げ中の位置に戻る」
 */
export function ReturnToReadingButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.returnButton} onPress={onPress}>
      <Ionicons color={THEME_COLORS.amber} name="arrow-down" size={13} />
      <Text style={styles.returnText}>読み上げ中の位置に戻る</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: "rgba(32, 39, 54, 0.97)",
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: READ_ALOUD_BAR_HEIGHT,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  barUnavailable: {
    borderColor: THEME_COLORS.line,
    paddingRight: 14,
  },
  label: {
    color: THEME_COLORS.fg,
    fontSize: 13,
  },
  labels: {
    flexShrink: 0,
    maxWidth: 200,
  },
  playButton: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.amber,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  playButtonLoading: {
    opacity: 0.5,
  },
  playButtonPressed: {
    backgroundColor: THEME_COLORS.amberBright,
  },
  playButtonUnavailable: {
    backgroundColor: THEME_COLORS.line,
  },
  /**
   * 再生の三角は見た目の重心が左に寄るので少し右へ
   */
  playIcon: {
    marginLeft: 2,
  },
  rateButton: {
    alignItems: "center",
    borderColor: THEME_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    minWidth: 46,
    paddingHorizontal: 6,
  },
  rateText: {
    color: THEME_COLORS.fgMuted,
    fontFamily: THEME_FONTS.code,
    fontSize: 12,
  },
  returnButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(32, 39, 54, 0.97)",
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  returnText: {
    color: THEME_COLORS.amber,
    fontSize: 12,
  },
  stopButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 28,
  },
  subLabel: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
  },
  track: {
    backgroundColor: THEME_COLORS.line,
    borderRadius: 2,
    flex: 1,
    height: 4,
    minWidth: 32,
    overflow: "hidden",
  },
  trackFill: {
    backgroundColor: "rgba(243, 178, 76, 0.8)",
    height: "100%",
  },
  unavailableText: {
    color: THEME_COLORS.fgMuted,
    flexShrink: 1,
    fontSize: 13,
  },
})
