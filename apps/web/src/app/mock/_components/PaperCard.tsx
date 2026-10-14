import { Fragment } from "react"

import type { MockVocabularyCard } from "@/libs/mock-data"

/**
 * インラインコード（改行を含まない、対になったバッククォート）
 */
const INLINE_CODE_PATTERN = /(`[^`\n]+`)/

/**
 * バッククォートのインラインコードを、紙の上のコードの見た目で描く
 */
function InkText({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE_CODE_PATTERN).map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rounded-[3px] bg-paper-edge/60 px-1 py-px font-code text-[0.84em] text-ink">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * 本文の 1 文。単語に蛍光ペンのような琥珀の線を引く
 */
export function SentenceText({ className = "", sentence }: { className?: string, sentence: NonNullable<MockVocabularyCard["sentence"]> }) {
  return (
    <p className={`font-reading leading-relaxed ${className}`}>
      <InkText text={sentence.text.slice(0, sentence.highlightStart)} />
      <mark className="rounded-[2px] bg-transparent bg-[linear-gradient(transparent_52%,rgb(243_178_76/0.55)_52%)] px-0.5 text-ink">
        <InkText text={sentence.text.slice(sentence.highlightStart, sentence.highlightEnd)} />
      </mark>
      <InkText text={sentence.text.slice(sentence.highlightEnd)} />
    </p>
  )
}

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
 * 語句と、見出し語が違うときの見出し語・品詞
 */
function WordHeading({ card, size }: { card: MockVocabularyCard, size: "lg" | "sm" }) {
  return (
    <div className={size === "lg" ? "text-center" : "flex flex-wrap items-baseline gap-x-2"}>
      <p className={`font-reading text-ink ${size === "lg" ? "text-[30px] leading-tight font-semibold sm:text-[34px]" : "text-[17px] font-semibold"}`}>
        {card.surface}
      </p>
      <p className={`flex items-center gap-2 text-ink-muted ${size === "lg" ? "mt-2 justify-center text-sm" : "text-xs"}`}>
        {card.lemma !== card.surface.toLowerCase() && <span className="font-reading">{card.lemma}</span>}
        {card.partOfSpeech && (
          <span className="rounded-full border border-ink-faint/60 px-2 py-px text-[11px] text-ink-muted">{card.partOfSpeech}</span>
        )}
      </p>
    </div>
  )
}

/**
 * カードの表。語句・本文の 1 文・出典。新しい単語には印を付ける
 */
export function PaperCardFront({ card }: { card: MockVocabularyCard }) {
  return (
    <div className="flex h-full flex-col px-6 pt-12 pb-5 sm:px-10 sm:pt-12">
      {card.stage === null && (
        <span className="absolute top-4 right-4 rotate-2 rounded border border-ink-amber/50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink-amber sm:top-5 sm:right-5">
          新しい単語
        </span>
      )}
      <div className="flex flex-1 flex-col justify-center gap-6">
        <WordHeading card={card} size="lg" />
        {card.sentence && <SentenceText className="text-center text-[15px] text-ink-muted sm:text-base" sentence={card.sentence} />}
      </div>
      <p className="mt-4 truncate text-center font-reading text-xs text-ink-faint italic">— {card.passageTitle} より</p>
    </div>
  )
}

/**
 * カードの裏。表の語句と 1 文を小さく残し、意味・補足・出どころを出す
 */
export function PaperCardBack({ card }: { card: MockVocabularyCard }) {
  const senses = card.meaningSource === "dictionary" ? card.meaningJa.split(" / ") : [card.meaningJa]
  return (
    <div className="flex h-full flex-col px-6 pt-12 pb-5 sm:px-10 sm:pt-12">
      <WordHeading card={card} size="sm" />
      {card.sentence && <SentenceText className="mt-1.5 line-clamp-2 text-[13px] text-ink-faint" sentence={card.sentence} />}
      <div className="my-4 border-t border-dashed border-ink-faint/50" />
      <div className="flex-1">
        <div aria-live="polite" className="space-y-1">
          {senses.map(sense => (
            <p key={sense} className="text-[19px] leading-snug font-semibold text-ink [word-break:auto-phrase] sm:text-[22px]">{sense}</p>
          ))}
        </div>
        {card.noteJa && <p className="mt-3 border-l-2 border-ink-amber/40 pl-3 text-[13px] leading-relaxed text-ink-muted">{card.noteJa}</p>}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className={`size-1.5 rounded-full ${card.meaningSource === "glossary" ? "bg-amber" : "bg-ink-faint"}`} />
        {card.meaningSource === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）"}
      </p>
    </div>
  )
}

/**
 * 重ねたカードの束（後ろの 2 枚）。残りの枚数に合わせて出す枚数を減らす
 */
export function CardStackBehind({ count }: { count: number }) {
  return (
    <>
      {count >= 2 && (
        <span aria-hidden className="absolute inset-x-4 top-4 -bottom-3 rotate-[-1.5deg] rounded-xl bg-paper-edge/80 shadow-[0_12px_30px_-12px_rgb(0_0_0/0.7)]" />
      )}
      {count >= 1 && (
        <span aria-hidden className="absolute inset-x-2 top-2 -bottom-1.5 rotate-[1deg] rounded-xl bg-paper-deep/90 shadow-[0_12px_30px_-12px_rgb(0_0_0/0.7)]" />
      )}
    </>
  )
}
