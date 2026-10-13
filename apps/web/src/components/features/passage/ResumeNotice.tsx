"use client"

import { readAttemptProgress } from "@/features/attempt/attempt-progress"
import { formatSeconds } from "@/libs/format"
import { useIsClient } from "@/libs/use-is-client"

const HOUR_MS = 60 * 60 * 1000

/**
 * 期限までの残りを時間に切り上げた文。1 時間未満は「1 時間以内」
 */
const buildExpiryText = (remainingMs: number): string =>
  remainingMs < HOUR_MS
    ? "あと 1 時間以内に期限切れになります。"
    : `あと ${Math.ceil(remainingMs / HOUR_MS)} 時間で期限切れになります。`

/**
 * 残り時間（負なら超過時間）
 */
const buildRemainingText = (remainingSeconds: number): string =>
  remainingSeconds < 0 ? `超過 +${formatSeconds(-remainingSeconds)}` : `残り ${formatSeconds(remainingSeconds)}`

/**
 * 開始確認の「前回の続きから再開できます。」。残り時間と回答数は端末に保存した途中経過から出す
 * （別の端末で始めた挑戦は保存が無いので経過 0・回答 0）。localStorage はサーバーで読めないので、
 * hydration が終わってから数字を出す（サーバーの HTML とのずれを防ぐ）
 */
export function ResumeNotice({
  attemptId,
  expiresAt,
  questionCount,
  serverNow,
  timeLimitSeconds,
}: {
  attemptId: number
  expiresAt: string
  questionCount: number
  serverNow: string
  timeLimitSeconds: number
}) {
  const isClient = useIsClient()
  const progress = isClient ? readAttemptProgress(attemptId) : null
  const elapsedSeconds = progress?.elapsedSeconds ?? 0
  const answeredCount = progress ? Object.keys(progress.answers).length : 0
  /**
   * 端末の時計のずれを補正した現在時刻は `Date.now() + (server_now − 描画時の Date.now())` で、
   * 描画時点では server_now そのものになる（端末の時計に依存しない）
   */
  const expiryRemainingMs = Date.parse(expiresAt) - Date.parse(serverNow)

  return (
    <div className="rounded-lg border border-amber/40 bg-amber-wash px-4 py-3 text-sm leading-relaxed">
      <p className="text-fg">前回の続きから再開できます。</p>
      <p className="mt-1 min-h-[1lh] text-fg-muted tabular-nums">
        {isClient
          ? `${buildRemainingText(timeLimitSeconds - elapsedSeconds)}、回答 ${answeredCount} / ${questionCount}。${buildExpiryText(expiryRemainingMs)}`
          : null}
      </p>
    </div>
  )
}
