import { Ionicons } from "@expo/vector-icons"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"
import { formatSeconds } from "@/libs/format"

/**
 * 残り時間の状態。残りが制限時間の 20% 以下で warning、0 未満で overtime（0 になっても止めずに超過を数える）
 */
export type TimerPhase = "normal" | "overtime" | "warning"

const WARNING_RATIO = 0.2

export const determineTimerPhase = (remainingSeconds: number, timeLimitSeconds: number): TimerPhase =>
  remainingSeconds < 0 ? "overtime" : remainingSeconds <= timeLimitSeconds * WARNING_RATIO ? "warning" : "normal"

const TIMER_COLORS: Record<TimerPhase, string> = {
  normal: THEME_COLORS.fg,
  overtime: THEME_COLORS.wrong,
  warning: THEME_COLORS.amber,
}

const PROGRESS_COLORS: Record<TimerPhase, string> = {
  normal: "rgba(243, 178, 76, 0.7)",
  overtime: THEME_COLORS.wrong,
  warning: THEME_COLORS.amberBright,
}

/**
 * 解答画面の上部バー（「‹ 中断」・残り時間・全文訳・一時停止）と、その下端の残り時間の進捗線。
 * タイトル・出典・文字サイズは出さない（mobile の画面）。
 * isTimerPending の間（端末の経過を戻す前）は数字を出さない（保存していた値に飛ぶのを見せない）
 */
export function SolvingTopBar({
  isPaused,
  isTimerPending,
  remainingSeconds,
  showAllTranslations,
  timeLimitSeconds,
  onInterrupt,
  onToggleAllTranslations,
  onTogglePause,
}: {
  isPaused: boolean
  isTimerPending: boolean
  remainingSeconds: number
  showAllTranslations: boolean
  timeLimitSeconds: number
  onInterrupt: () => void
  onToggleAllTranslations: () => void
  onTogglePause: () => void
}) {
  const phase = determineTimerPhase(remainingSeconds, timeLimitSeconds)
  const isOvertime = phase === "overtime"
  const remainingRatio = timeLimitSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / timeLimitSeconds)) : 0

  return (
    <View>
      <View style={styles.bar}>
        <Pressable
          accessibilityHint="途中経過はこの端末に保存され、24 時間以内なら再開できます"
          accessibilityRole="button"
          hitSlop={8}
          style={styles.back}
          onPress={onInterrupt}
        >
          <Ionicons color={THEME_COLORS.fgMuted} name="chevron-back" size={18} />
          <Text style={styles.backText}>中断</Text>
        </Pressable>
        <View accessibilityRole="timer" style={styles.timer}>
          <Text style={styles.timerLabel}>{isOvertime ? "超過" : "残り"}</Text>
          <Text style={[styles.timerValue, { color: TIMER_COLORS[phase] }, isTimerPending && styles.hidden]}>
            {isOvertime ? `+${formatSeconds(-remainingSeconds)}` : formatSeconds(remainingSeconds)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isPaused, selected: showAllTranslations }}
          disabled={isPaused}
          style={[styles.toolButton, showAllTranslations && styles.toolButtonActive, isPaused && styles.disabled]}
          onPress={onToggleAllTranslations}
        >
          <Text style={[styles.toolText, showAllTranslations && styles.toolTextActive]}>全文訳</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={isPaused ? "再開する" : "一時停止"}
          accessibilityRole="button"
          style={[styles.iconButton, isPaused && styles.iconButtonActive]}
          onPress={onTogglePause}
        >
          <Ionicons color={THEME_COLORS.fgMuted} name={isPaused ? "play" : "pause"} size={14} />
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        {!isTimerPending && (
          <View
            style={[
              styles.progressFill,
              { backgroundColor: PROGRESS_COLORS[phase], width: isOvertime ? "100%" : `${remainingRatio * 100}%` },
            ]}
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    paddingVertical: 6,
  },
  backText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 56,
    paddingHorizontal: 14,
  },
  disabled: {
    opacity: 0.4,
  },
  hidden: {
    opacity: 0,
  },
  iconButton: {
    alignItems: "center",
    borderColor: THEME_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  iconButtonActive: {
    backgroundColor: THEME_COLORS.raised,
    borderColor: THEME_COLORS.lineStrong,
  },
  progressFill: {
    height: 2,
  },
  progressTrack: {
    backgroundColor: THEME_COLORS.line,
    height: 2,
  },
  timer: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 5,
    marginLeft: "auto",
  },
  timerLabel: {
    color: THEME_COLORS.fgMuted,
    fontSize: 11,
  },
  timerValue: {
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  toolButton: {
    borderColor: THEME_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  toolButtonActive: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.6)",
  },
  toolText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
  },
  toolTextActive: {
    color: THEME_COLORS.amber,
  },
})
