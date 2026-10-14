"use client"

import type { GetAdminPassageResponse } from "@repo/api-schema"

import { numberParagraphs, type PassageFormGlossaryEntry, type SurfaceRange } from "@/features/passage/passage.form"

/**
 * プレビューの 1 ブロック（種類・言語は詳細、英文・和訳はフォームの未保存の修正を含む値）
 */
export type PreviewBlock = {
  lang: string | null
  text: string
  translationJa: string | null
  type: GetAdminPassageResponse["blocks"][number]["type"]
}

/**
 * 下線を引く語句。range は生の本文（バッククォートを含む）上の位置で、本文に見つからなければ null（locateGlossaryEntry で求める）
 */
export type PreviewGlossaryEntry = Pick<PassageFormGlossaryEntry, "block_index" | "clientKey" | "lemma" | "meaning_ja" | "surface"> & {
  range: SurfaceRange | null
}

type Run = {
  glossaryKey: string | null
  isCode: boolean
  isHighlight: boolean
  text: string
}

/**
 * ブロックの本文を、インラインコード・用語集の語句・根拠のハイライトごとの連続区間に分ける
 *
 * 用語集の語句と根拠の引用は重なりうる（引用の中に語句がある）ため、1 文字（UTF-16 の 1 単位）ずつ属性を付けてからまとめる。
 * 用語集の位置は保存される位置と同じく生の本文（バッククォートを含む）上で付けてからバッククォートを除き、
 * 根拠の引用は API の hasQuote と同じくバッククォートを除いた本文で探す。
 */
const buildRuns = (text: string, entries: PreviewGlossaryEntry[], quote: string | null): Run[] => {
  const rawGlossaryKeys: (string | null)[] = Array.from({ length: text.length }, () => null)
  for (const entry of entries) {
    if (!entry.range) continue
    for (let index = entry.range.startOffset; index < entry.range.endOffset && index < text.length; index++) {
      rawGlossaryKeys[index] = entry.clientKey
    }
  }

  let plain = ""
  const codeFlags: boolean[] = []
  const glossaryKeys: (string | null)[] = []
  let isInCode = false
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index)
    if (char === "`") {
      isInCode = !isInCode
      continue
    }
    plain += char
    codeFlags.push(isInCode)
    glossaryKeys.push(rawGlossaryKeys[index] ?? null)
  }

  const highlightFlags: boolean[] = Array.from({ length: plain.length }, () => false)
  const normalizedQuote = quote?.replaceAll("`", "") ?? ""
  const quoteStart = normalizedQuote.length > 0 ? plain.indexOf(normalizedQuote) : -1
  if (quoteStart >= 0) {
    for (let index = quoteStart; index < quoteStart + normalizedQuote.length; index++) highlightFlags[index] = true
  }

  const runs: Run[] = []
  for (let index = 0; index < plain.length; index++) {
    const last = runs[runs.length - 1]
    if (last && last.isCode === codeFlags[index] && last.glossaryKey === glossaryKeys[index] && last.isHighlight === highlightFlags[index]) {
      last.text += plain[index]
    } else {
      runs.push({ glossaryKey: glossaryKeys[index], isCode: codeFlags[index], isHighlight: highlightFlags[index], text: plain[index] })
    }
  }
  return runs
}

/**
 * ユーザーの解答画面と同じ見た目のプレビュー（ダーク・Literata）。管理者向けに用語集の語句に下線を引き、開いている設問の根拠をハイライトする
 */
export function PassagePreview({
  blocks,
  glossary,
  highlight,
  showAllTranslations,
  showGlossary,
  translatedBlocks,
  vocabularyTargetKeys,
  onToggleTranslation,
}: {
  blocks: PreviewBlock[]
  glossary: PreviewGlossaryEntry[]
  highlight: { blockIndex: number, quote: string } | null
  showAllTranslations: boolean
  showGlossary: boolean
  translatedBlocks: Set<number>
  vocabularyTargetKeys: string[]
  onToggleTranslation: (blockIndex: number) => void
}) {
  const paragraphNumbers = numberParagraphs(blocks)

  return (
    <article
      className="rounded-xl bg-[#12161f] px-3 py-6 text-[17px] leading-[1.8] text-[#dde2ea] sm:px-5"
      style={{ fontFamily: "var(--font-literata), Georgia, serif" }}
    >
      {blocks.map((block, blockIndex) => {
        const isTranslated = block.type !== "code" && (showAllTranslations || translatedBlocks.has(blockIndex))
        const entries = showGlossary ? glossary.filter((entry) => entry.block_index === blockIndex) : []
        const quote = highlight?.blockIndex === blockIndex ? highlight.quote : null

        return (
          <section key={blockIndex} className="group grid scroll-mt-28 grid-cols-[2.75rem_minmax(0,1fr)]" id={`preview-block-${blockIndex}`}>
            <div className="flex flex-col items-end gap-1.5 pt-[0.5em] pr-3 font-mono text-[11px] leading-none text-[#647086]">
              {block.type === "heading" && <span>#</span>}
              {paragraphNumbers[blockIndex] !== null && <span>{paragraphNumbers[blockIndex]}</span>}
              {block.type !== "code" && (
                <button
                  className={`rounded border px-1 py-0.5 font-sans text-[10px] transition ${
                    isTranslated ? "border-[#f3b24c]/50 bg-[#f3b24c]/10 text-[#f3b24c]" : "border-[#3a4356] text-[#949db1] opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={() => onToggleTranslation(blockIndex)}
                  type="button"
                >
                  訳
                </button>
              )}
            </div>
            <div className="min-w-0">
              {block.type === "code" ? (
                <pre className="my-4 overflow-x-auto rounded-lg border border-[#29303f] bg-[#181d28] p-4 font-mono text-[13px] leading-[1.7]">{block.text}</pre>
              ) : isTranslated ? (
                <p className={`border-l-2 border-[#f3b24c]/50 pl-4 font-sans text-[15px] leading-[1.9] ${block.type === "heading" ? "mb-4 font-semibold" : "mb-[1.1em]"}`}>
                  {block.translationJa?.trim() ? block.translationJa : <span className="text-[#f08c8c]">和訳がありません</span>}
                </p>
              ) : (
                <p className={block.type === "heading" ? "mb-4 text-[1.5em] leading-tight font-semibold" : "mb-[1.1em]"}>
                  {buildRuns(block.text, entries, quote).map((run, index) => {
                    if (run.isCode) {
                      return <code key={index} className="rounded border border-[#29303f] bg-[#181d28] px-1 font-mono text-[0.82em]">{run.text}</code>
                    }
                    const entry = run.glossaryKey !== null ? glossary.find((item) => item.clientKey === run.glossaryKey) : undefined
                    const isTarget = entry ? vocabularyTargetKeys.includes(entry.clientKey) : false
                    return (
                      <span
                        key={index}
                        className={`${run.isHighlight ? "bg-[#f3b24c]/25" : ""} ${
                          entry ? `underline decoration-2 underline-offset-4 ${isTarget ? "decoration-[#90c6f0] decoration-dashed" : "decoration-[#f3b24c]/80 decoration-dotted"}` : ""
                        }`}
                        title={entry ? `${entry.lemma}：${entry.meaning_ja}${isTarget ? "（語義設問の対象。解答中は非表示）" : ""}` : undefined}
                      >
                        {run.text}
                      </span>
                    )
                  })}
                </p>
              )}
            </div>
          </section>
        )
      })}
    </article>
  )
}
