import { formatSeconds } from "@/libs/format"

/**
 * 残り時間の状態。残りが制限時間の 20% 以下で warning、0 未満で overtime（0 になっても止めずに超過を数える）
 */
export type TimerPhase = "normal" | "overtime" | "warning"

const WARNING_RATIO = 0.2

export const determineTimerPhase = (remainingSeconds: number, timeLimitSeconds: number): TimerPhase =>
  remainingSeconds < 0 ? "overtime" : remainingSeconds <= timeLimitSeconds * WARNING_RATIO ? "warning" : "normal"

const PHASE_TEXT_CLASS: Record<TimerPhase, string> = {
  normal: "text-fg",
  overtime: "text-wrong",
  warning: "text-amber",
}

/**
 * 上部バーの残り時間。超過したら「超過 +m:ss」のカウントアップ。等幅数字。
 * isPending の間（端末の経過を戻す前）は数字を出さない（保存していた値に飛ぶのを見せない）
 */
export function TimerReadout({
  isPending,
  remainingSeconds,
  timeLimitSeconds,
}: {
  isPending: boolean
  remainingSeconds: number
  timeLimitSeconds: number
}) {
  const phase = determineTimerPhase(remainingSeconds, timeLimitSeconds)
  const isOvertime = phase === "overtime"
  return (
    <div aria-live="off" className={`flex items-baseline gap-1.5 tabular-nums ${PHASE_TEXT_CLASS[phase]}`} role="timer">
      <span className="text-[11px] text-fg-muted">{isOvertime ? "超過" : "残り"}</span>
      <span className={`text-lg font-semibold tracking-tight ${isPending ? "invisible" : ""}`}>
        {isOvertime ? `+${formatSeconds(-remainingSeconds)}` : formatSeconds(remainingSeconds)}
      </span>
    </div>
  )
}
