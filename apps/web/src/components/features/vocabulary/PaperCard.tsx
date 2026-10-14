import type { GetVocabularySessionResponse } from "@repo/api-schema"

import { splitDictionarySenses } from "@/components/features/passage/passage-text"

import { type PronunciationControls, SentenceSoundButton, WordSoundButton } from "./PronunciationButtons"
import { SentenceText } from "./SentenceText"

export type VocabularyCard = GetVocabularySessionResponse["cards"][number]

/**
 * 裏に出す辞書の語義の数。多い単語（EJDict の run など）は先頭から出し、残りは「…」にする（紙の高さは決まっているので、はみ出さないように）
 */
const MAX_SENSES = 4

/**
 * 束の後ろの 2 枚。手前のカードと合わせて 3 枚に見えるよう、1 枚ごとに下へずらし、横にも少しずらして傾ける。
 * 奥ほど紙を濃くし、上の縁に明るい線を入れて、重なりの境目を見せる
 */
const STACK_LAYERS = [
  { className: "bg-[linear-gradient(180deg,#e7dbc3,#dccfb4)]", transform: "translate(-7px, 22px) rotate(-2.2deg)" },
  { className: "bg-[linear-gradient(180deg,#efe4ce,#e4d7bd)]", transform: "translate(5px, 11px) rotate(1.4deg)" },
]

/**
 * 単語帳のリングを通す穴（パンチで開けた穴から、後ろの暗い画面が見える）
 */
function PunchHole() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-4 left-4 grid size-6 place-items-center rounded-full bg-paper-deep shadow-[inset_0_1px_1px_rgb(255_255_255/0.6),0_0_0_1px_rgb(120_90_40/0.12)] sm:top-5 sm:left-5"
    >
      <span className="block size-3.5 rounded-full bg-canvas shadow-[inset_0_2px_3px_rgb(0_0_0/0.8)]" />
    </span>
  )
}

/**
 * 紙の 1 枚（表と裏で共通の地）。読書灯が上から当たっているように、上ほど明るくする。
 * position（relative / absolute）は呼び出し側が className で決める
 */
export function PaperSheet({ children, className = "", tone = "front" }: { children: React.ReactNode, className?: string, tone?: "back" | "front" }) {
  return (
    <div
      className={`overflow-hidden rounded-xl text-ink shadow-[0_18px_40px_-12px_rgb(0_0_0/0.7),0_2px_0_rgb(0_0_0/0.25)] ${
        tone === "front"
          ? "bg-[linear-gradient(180deg,#f7eedc_0%,var(--color-paper)_45%,var(--color-paper-deep)_100%)]"
          : "bg-[linear-gradient(180deg,#f1e6d0_0%,var(--color-paper-deep)_100%)]"
      } ${className}`}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35),inset_0_-24px_40px_-24px_rgb(120_90_40/0.25)]" />
      <PunchHole />
      {children}
    </div>
  )
}

/**
 * 語句と、見出し語が違うときの見出し語・品詞。発音の操作を渡されたら、語句のすぐ右に単語の発音のボタンを置く。
 * 表は左にボタンと同じ幅の空きを置いて語句を中央に保つ（長い語句はボタンの左で折り返す）
 */
function WordHeading({ card, pronunciation, size }: { card: VocabularyCard, pronunciation?: PronunciationControls, size: "lg" | "sm" }) {
  const wordButton = pronunciation && (
    <WordSoundButton controls={pronunciation} isReady={card.pronunciation.word_url !== null} lemma={card.lemma} size={size} />
  )
  return (
    <div className={size === "lg" ? "text-center" : `flex flex-wrap gap-x-2 ${pronunciation ? "items-center" : "items-baseline"}`}>
      {size === "lg" ? (
        <div className="flex items-center justify-center gap-2">
          {pronunciation && <span aria-hidden className="w-9 shrink-0" />}
          <p className="font-reading text-[30px] leading-tight font-semibold text-ink sm:text-[34px]">{card.surface}</p>
          {wordButton}
        </div>
      ) : (
        <p className="flex items-center gap-1 font-reading text-[17px] font-semibold text-ink">
          {card.surface}
          {wordButton}
        </p>
      )}
      <p className={`flex items-center gap-2 text-ink-muted ${size === "lg" ? "mt-2 justify-center text-sm" : "text-xs"}`}>
        {card.lemma !== card.surface.toLowerCase() && <span className="font-reading">{card.lemma}</span>}
        {card.part_of_speech && (
          <span className="rounded-full border border-ink-faint/60 px-2 py-px text-[11px] text-ink-muted">{card.part_of_speech}</span>
        )}
      </p>
    </div>
  )
}

/**
 * カードの表。語句・本文の 1 文・出典。新しい単語には印を付ける。
 * 発音の操作を渡されたら、語句の右に単語のボタン、1 文の下に 1 文のボタン（1 文の音声があるときだけ）を置く
 */
export function PaperCardFront({ card, pronunciation }: { card: VocabularyCard, pronunciation?: PronunciationControls }) {
  return (
    <div className="flex h-full flex-col px-6 pt-12 pb-5 sm:px-10">
      {card.stage === null && (
        <span className="absolute top-4 right-4 rotate-2 rounded border border-ink-amber/50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink-amber sm:top-5 sm:right-5">
          新しい単語
        </span>
      )}
      <div className="flex flex-1 flex-col justify-center gap-6">
        <WordHeading card={card} pronunciation={pronunciation} size="lg" />
        {card.sentence && (
          <div className="space-y-2">
            <SentenceText
              className="text-center text-[15px] text-ink-muted sm:text-base"
              isPlaying={pronunciation?.playing === "sentence"}
              sentence={card.sentence}
            />
            {pronunciation && card.pronunciation.sentence && <SentenceSoundButton align="center" controls={pronunciation} />}
          </div>
        )}
      </div>
      <p className="mt-4 truncate text-center font-reading text-xs text-ink-faint italic">— {card.passage.title} より</p>
    </div>
  )
}

/**
 * カードの裏。表の語句と 1 文を小さく残し、意味・補足・出どころを出す。辞書の意味は " / " で行を分ける。
 * 発音のボタンは表と同じく語句の右と 1 文の下（1 文のボタンは左寄せ）
 */
export function PaperCardBack({ card, pronunciation }: { card: VocabularyCard, pronunciation?: PronunciationControls }) {
  const allSenses = card.meaning_source === "dictionary" ? splitDictionarySenses(card.meaning_ja) : [card.meaning_ja]
  const senses = allSenses.length > MAX_SENSES ? [...allSenses.slice(0, MAX_SENSES), "…"] : allSenses
  return (
    <div className="flex h-full flex-col px-6 pt-12 pb-5 sm:px-10">
      <WordHeading card={card} pronunciation={pronunciation} size="sm" />
      {card.sentence && (
        <SentenceText className="mt-1.5 line-clamp-2 text-[13px] text-ink-faint" isPlaying={pronunciation?.playing === "sentence"} sentence={card.sentence} />
      )}
      {pronunciation && card.sentence && card.pronunciation.sentence && (
        <div className="mt-1"><SentenceSoundButton align="start" controls={pronunciation} /></div>
      )}
      <div className="my-4 border-t border-dashed border-ink-faint/50" />
      <div className="flex-1">
        <div className="space-y-1">
          {senses.map((sense, index) => (
            <p key={index} className="text-[19px] leading-snug font-semibold text-ink [word-break:auto-phrase] sm:text-[22px]">{sense}</p>
          ))}
        </div>
        {card.note_ja && <p className="mt-3 border-l-2 border-ink-amber/40 pl-3 text-[13px] leading-relaxed text-ink-muted">{card.note_ja}</p>}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className={`size-1.5 rounded-full ${card.meaning_source === "glossary" ? "bg-amber" : "bg-ink-faint"}`} />
        {card.meaning_source === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）"}
      </p>
    </div>
  )
}

/**
 * 重ねたカードの束（後ろの 2 枚）。残りの枚数に合わせて出す枚数を減らす（残り 1 枚なら 1 枚、0 枚なら出さない）
 */
export function CardStackBehind({ count }: { count: number }) {
  const layers = STACK_LAYERS.slice(STACK_LAYERS.length - Math.min(Math.max(count, 0), STACK_LAYERS.length))
  return (
    <>
      {layers.map(layer => (
        <span
          key={layer.transform}
          aria-hidden
          className={`absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_14px_28px_-14px_rgb(0_0_0/0.85),0_2px_0_rgb(0_0_0/0.25)] ${layer.className}`}
          style={{ transform: layer.transform }}
        />
      ))}
    </>
  )
}
