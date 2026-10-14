import { StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"
import { formatSeconds } from "@/libs/format"

const HOUR_MS = 60 * 60 * 1000

/**
 * 期限までの残りを時間に切り上げた文。1 時間未満は「1 時間以内」（web の ResumeNotice と同じ）
 */
const buildExpiryText = (remainingMs: number): string =>
  remainingMs < HOUR_MS
    ? "あと 1 時間以内に期限切れになります。"
    : `あと ${Math.ceil(remainingMs / HOUR_MS)} 時間で期限切れになります。`

/**
 * 公開を終了した問題（新しく始められない）の挑戦中に添える文（web の ResumeNotice と同じ）
 */
const UNPUBLISHED_TEXT = "この問題は公開を終了しています。この挑戦は再開して提出できますが、新しく始めることはできません。"

/**
 * 残り時間（負なら超過時間）
 */
const buildRemainingText = (remainingSeconds: number): string =>
  remainingSeconds < 0 ? `超過 +${formatSeconds(-remainingSeconds)}` : `残り ${formatSeconds(remainingSeconds)}`

/**
 * 開始確認の「前回の続きから再開できます。」（琥珀の枠と淡い琥珀の背景）。
 * 経過秒数と回答数は端末に保存した途中経過から出す（別の端末で始めた挑戦は保存が無いので 0）。
 * 公開を終了した問題（canStart が false）は、新しく始められないことを添える
 */
export function ResumeNotice({
  answeredCount,
  canStart,
  elapsedSeconds,
  expiryRemainingMs,
  questionCount,
  timeLimitSeconds,
}: {
  answeredCount: number
  canStart: boolean
  elapsedSeconds: number
  expiryRemainingMs: number
  questionCount: number
  timeLimitSeconds: number
}) {
  return (
    <View style={styles.resume}>
      <Text style={styles.title}>前回の続きから再開できます。</Text>
      <Text style={styles.text}>
        {`${buildRemainingText(timeLimitSeconds - elapsedSeconds)}、回答 ${answeredCount} / ${questionCount}。${buildExpiryText(expiryRemainingMs)}`}
      </Text>
      {!canStart && <Text style={styles.text}>{UNPUBLISHED_TEXT}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  resume: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 20,
    padding: 14,
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 14,
  },
})
