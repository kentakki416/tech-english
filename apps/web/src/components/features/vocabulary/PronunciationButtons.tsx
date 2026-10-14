"use client"

import type { PronunciationTarget } from "./use-pronunciation"

/**
 * カードに渡す発音の操作。鳴らせるか（音声があるか）はカードの pronunciation から決める
 */
export type PronunciationControls = {
  playing: PronunciationTarget | null
  onToggle: (target: PronunciationTarget) => void
}

/**
 * スピーカーと音の波。再生中は波を内側から順に明滅させる（視差効果を減らす設定では色だけ）
 */
function SpeakerIcon({ className, isPlaying }: { className: string, isPlaying: boolean }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" fillOpacity={0.15} />
      <path className={isPlaying ? "motion-safe:animate-sound-wave" : ""} d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path className={isPlaying ? "motion-safe:animate-sound-wave motion-safe:[animation-delay:200ms]" : ""} d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  )
}

/**
 * 語句のすぐ右の、単語の発音のボタン（見出し語を読む）。音声がまだできていなければ「準備中」で押せない。
 * カードのクリック（めくる）と重ならないよう、クリックの伝播を止める
 */
export function WordSoundButton({
  controls,
  isReady,
  lemma,
  size,
}: {
  controls: PronunciationControls
  isReady: boolean
  lemma: string
  size: "lg" | "sm"
}) {
  const isPlaying = controls.playing === "word"
  return (
    <button
      aria-label={isReady ? `${lemma} の発音を聞く` : `${lemma} の発音は準備中です`}
      aria-pressed={isPlaying}
      className={`inline-grid shrink-0 place-items-center rounded-full align-middle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber/70 ${
        size === "lg" ? "size-9" : "size-7"
      } ${
        isPlaying
          ? "bg-amber/20 text-ink-amber shadow-[inset_0_0_0_1px_rgb(148_96_15/0.35)]"
          : isReady
            ? "text-ink-muted hover:bg-paper-edge/60 hover:text-ink"
            : "cursor-not-allowed text-ink-faint/60"
      }`}
      disabled={!isReady}
      onClick={(event) => {
        event.stopPropagation()
        controls.onToggle("word")
      }}
      title={isReady ? "発音を聞く" : "発音を準備中です"}
      type="button"
    >
      <SpeakerIcon className={size === "lg" ? "size-5" : "size-4"} isPlaying={isPlaying} />
    </button>
  )
}

/**
 * 1 文のすぐ下の、1 文の読み上げのボタン（1 文の音声があるときだけ置く）。表は中央、裏は左寄せで三角を 1 文の頭にそろえる
 */
export function SentenceSoundButton({ align, controls }: { align: "center" | "start", controls: PronunciationControls }) {
  const isPlaying = controls.playing === "sentence"
  return (
    <div className={align === "center" ? "flex justify-center" : "-ml-2.5 flex"}>
      <button
        aria-pressed={isPlaying}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber/70 ${
          isPlaying ? "bg-amber/20 text-ink-amber" : "text-ink-muted hover:bg-paper-edge/60 hover:text-ink"
        }`}
        onClick={(event) => {
          event.stopPropagation()
          controls.onToggle("sentence")
        }}
        type="button"
      >
        {isPlaying ? (
          <SpeakerIcon className="size-3.5" isPlaying />
        ) : (
          <svg aria-hidden className="size-3" fill="currentColor" viewBox="0 0 12 12">
            <path d="M3 1.8v8.4L10 6 3 1.8Z" />
          </svg>
        )}
        {isPlaying ? "この文を再生中" : "この文を聞く"}
      </button>
    </div>
  )
}
