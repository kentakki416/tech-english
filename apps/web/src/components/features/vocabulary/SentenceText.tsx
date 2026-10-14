import { Fragment } from "react"

import type { GetVocabularySessionResponse } from "@repo/api-schema"

import { splitInlineCode } from "@/components/features/passage/passage-text"

type VocabularySentence = NonNullable<GetVocabularySessionResponse["cards"][number]["sentence"]>

/**
 * バッククォートのインラインコードを、紙の上のコードの見た目（生成りの地・墨色）で描く。
 * 本文の InlineCode は暗い地の見た目なので、紙のカードでは使わない
 */
function InkText({ text }: { text: string }) {
  return (
    <>
      {splitInlineCode(text).map((part, index) =>
        part.isCode ? (
          <code key={index} className="rounded-[3px] bg-paper-edge/60 px-1 py-px font-code text-[0.84em] text-ink">
            {part.text}
          </code>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * 本文の 1 文。単語に蛍光ペンのような琥珀の線を引く。1 文を再生している間は線のまわりをゆっくり光らせる（vocabulary-pronunciation README「UI 設計 > 動き」）。
 * 行数で切る（overflow: hidden の）ところでは外側の光が切れるので、isGlowInset で光を内側に出す
 */
export function SentenceText({
  className = "",
  isGlowInset = false,
  isPlaying = false,
  sentence,
}: {
  className?: string
  isGlowInset?: boolean
  isPlaying?: boolean
  sentence: VocabularySentence
}) {
  return (
    <p className={`font-reading leading-relaxed ${className}`}>
      <InkText text={sentence.text.slice(0, sentence.highlight_start)} />
      <mark
        className={`rounded-[2px] bg-transparent bg-[linear-gradient(transparent_52%,rgb(243_178_76/0.55)_52%)] px-0.5 text-ink ${
          isPlaying ? (isGlowInset ? "motion-safe:animate-highlight-glow-inset" : "motion-safe:animate-highlight-glow") : ""
        }`}
      >
        <InkText text={sentence.text.slice(sentence.highlight_start, sentence.highlight_end)} />
      </mark>
      <InkText text={sentence.text.slice(sentence.highlight_end)} />
    </p>
  )
}
