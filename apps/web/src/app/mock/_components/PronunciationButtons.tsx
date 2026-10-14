"use client"

/**
 * モック：単語帳のカードの発音のボタン（vocabulary-pronunciation）。本番は mp3 を鳴らすが、モックはブラウザの音声合成で代わりに読む
 */

export type PronunciationTarget = "sentence" | "word"

export type MockPronunciation = {
  /**
   * 1 文の音声があるか（問題の読み上げの音声ができていなければボタンを出さない）
   */
  hasSentence: boolean
  /**
   * 単語の音声ができているか（できていなければ「準備中」で押せない）
   */
  isWordReady: boolean
  playing: PronunciationTarget | null
  onToggle: (target: PronunciationTarget) => void
}

/**
 * スピーカーと音の波。再生中は波を順に明滅させる（視差効果を減らす設定では色だけ）
 */
function SpeakerIcon({ className = "", isPlaying }: { className?: string, isPlaying: boolean }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" fillOpacity={0.15} />
      <path className={isPlaying ? "motion-safe:animate-sound-wave" : ""} d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path className={isPlaying ? "motion-safe:animate-sound-wave [animation-delay:200ms]" : ""} d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  )
}

/**
 * 語句のすぐ右の、単語の発音のボタン（見出し語を読む）。カードのクリック（めくる）と重ならないよう伝播を止める
 */
export function WordSoundButton({ lemma, pronunciation, size }: { lemma: string, pronunciation: MockPronunciation, size: "lg" | "sm" }) {
  const isPlaying = pronunciation.playing === "word"
  const label = pronunciation.isWordReady ? `${lemma} の発音を聞く` : `${lemma} の発音は準備中です`
  return (
    <button
      aria-label={label}
      aria-pressed={isPlaying}
      className={`inline-grid shrink-0 place-items-center rounded-full align-middle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber/70 ${
        size === "lg" ? "size-9" : "size-7"
      } ${
        isPlaying
          ? "bg-amber/20 text-ink-amber shadow-[inset_0_0_0_1px_rgb(148_96_15/0.35)]"
          : pronunciation.isWordReady
            ? "text-ink-muted hover:bg-paper-edge/60 hover:text-ink"
            : "cursor-not-allowed text-ink-faint/60"
      }`}
      disabled={!pronunciation.isWordReady}
      onClick={(event) => {
        event.stopPropagation()
        pronunciation.onToggle("word")
      }}
      title={pronunciation.isWordReady ? "発音を聞く" : "発音を準備中です"}
      type="button"
    >
      <SpeakerIcon className={size === "lg" ? "size-5" : "size-4"} isPlaying={isPlaying} />
    </button>
  )
}

/**
 * 1 文のすぐ下の、1 文の読み上げのボタン。1 文の音声が無ければ何も出さない
 */
export function SentenceSoundButton({ align, pronunciation }: { align: "center" | "start", pronunciation: MockPronunciation }) {
  if (!pronunciation.hasSentence) return null
  const isPlaying = pronunciation.playing === "sentence"
  return (
    <div className={align === "center" ? "flex justify-center" : "flex"}>
      <button
        aria-pressed={isPlaying}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber/70 ${
          isPlaying ? "bg-amber/20 text-ink-amber" : "text-ink-muted hover:bg-paper-edge/60 hover:text-ink"
        }`}
        onClick={(event) => {
          event.stopPropagation()
          pronunciation.onToggle("sentence")
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
