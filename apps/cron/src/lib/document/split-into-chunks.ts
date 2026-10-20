import type { PassageBlock } from "@repo/domain"

import { PASSAGE_MAX_WORDS, PASSAGE_MIN_WORDS, SECTION_HEADING_MAX_DEPTH } from "./const"
import { calculateContentHash } from "./content-hash"
import type { DocumentBlock } from "./convert-mdast-to-blocks"
import { countEnglishWords, findRejectReasons, type ChunkRejectReason } from "./passage-rules"

export type PassageChunk = {
  blocks: PassageBlock[]
  contentHash: string
  /**
   * 空なら本文候補
   */
  rejectReasons: ChunkRejectReason[]
  title: string
  wordCount: number
}

/**
 * 切り分けの途中の塊。sectionTitle は塊が属する節の先頭の見出し（無ければ null）。
 * partNumber は長い節を分けたときの何番目の塊か（分けていない節は 1）
 */
type Unit = {
  blocks: DocumentBlock[]
  partNumber: number
  sectionTitle: string | null
  wordCount: number
}

const isSectionHeading = (block: DocumentBlock): boolean =>
  block.type === "heading" && block.headingDepth !== undefined && block.headingDepth <= SECTION_HEADING_MAX_DEPTH

const buildUnit = (blocks: DocumentBlock[], sectionTitle: string | null, partNumber = 1): Unit => ({
  blocks,
  partNumber,
  sectionTitle,
  wordCount: countEnglishWords(blocks),
})

/**
 * h1〜h3 の見出しの前で区切って節の列にする。最初の見出しより前のブロックも 1 つの節にする
 */
const groupIntoSections = (blocks: DocumentBlock[]): Unit[] => {
  const sections: DocumentBlock[][] = []
  for (const block of blocks) {
    const current = sections[sections.length - 1]
    if (!current || isSectionHeading(block)) {
      sections.push([block])
      continue
    }
    current.push(block)
  }
  return sections.map((sectionBlocks) => {
    const [first] = sectionBlocks
    return buildUnit(sectionBlocks, first && isSectionHeading(first) ? first.text : null)
  })
}

/**
 * PASSAGE_MAX_WORDS を超える節を、ブロックを前から足して超える手前で分ける。分けた後ろの塊も同じ sectionTitle を持ち、
 * partNumber で何番目かを区別する。1 ブロックで上限を超えるものはそのまま残す（too_long で本文候補から外れる）
 */
const splitLongSection = (section: Unit): Unit[] => {
  if (section.wordCount <= PASSAGE_MAX_WORDS) return [section]
  const groups: DocumentBlock[][] = []
  let current: DocumentBlock[] = []
  let currentWordCount = 0
  for (const block of section.blocks) {
    const wordCount = countEnglishWords([block])
    if (current.length > 0 && currentWordCount + wordCount > PASSAGE_MAX_WORDS) {
      groups.push(current)
      current = []
      currentWordCount = 0
    }
    current.push(block)
    currentWordCount += wordCount
  }
  if (current.length > 0) groups.push(current)
  return groups.map((blocks, index) => buildUnit(blocks, section.sectionTitle, index + 1))
}

/**
 * 前から順に、今の塊が PASSAGE_MIN_WORDS 未満で、次の塊を足しても PASSAGE_MAX_WORDS 以下なら結合する
 */
const mergeShortUnits = (units: Unit[]): Unit[] => {
  const merged: Unit[] = []
  for (const unit of units) {
    const current = merged[merged.length - 1]
    if (current && current.wordCount < PASSAGE_MIN_WORDS && current.wordCount + unit.wordCount <= PASSAGE_MAX_WORDS) {
      merged[merged.length - 1] = {
        blocks: [...current.blocks, ...unit.blocks],
        partNumber: current.partNumber,
        sectionTitle: current.sectionTitle ?? unit.sectionTitle,
        wordCount: current.wordCount + unit.wordCount,
      }
      continue
    }
    merged.push(unit)
  }
  return merged
}

const convertToPassageBlock = ({ headingDepth: _headingDepth, ...block }: DocumentBlock): PassageBlock => block

/**
 * タイトルは塊の中の最初の見出し → 節の見出し → 文書のタイトルの順。長い節を分けた 2 つめ以降の塊で、塊の中に見出しが無ければ
 * 「 (2)」のように番号を付ける（同じ見出しの本文候補が並ばないように。収集では、下書き・公開済みと同じ見出しの塊を作らないため、
 * 番号が無いと前の塊に下書きがあるときに後ろの塊が作られない）
 */
const buildChunkTitle = (unit: Unit, firstHeadingText: string | undefined, documentTitle: string): string => {
  if (firstHeadingText !== undefined) return firstHeadingText
  const title = unit.sectionTitle ?? documentTitle
  return unit.partNumber > 1 ? `${title} (${unit.partNumber})` : title
}

const buildChunk = (unit: Unit, documentTitle: string): PassageChunk => {
  const blocks = unit.blocks.map(convertToPassageBlock)
  const firstHeading = blocks.find((block) => block.type === "heading")
  return {
    blocks,
    contentHash: calculateContentHash(blocks),
    rejectReasons: findRejectReasons(blocks),
    title: buildChunkTitle(unit, firstHeading?.text, documentTitle),
    wordCount: unit.wordCount,
  }
}

/**
 * 文書のブロック列を、見出し単位で区切って 200〜600 語の塊に切り分ける。条件を満たさない塊も rejectReasons つきで返す
 */
export const splitIntoChunks = (blocks: DocumentBlock[], documentTitle: string): PassageChunk[] => {
  const sections = groupIntoSections(blocks)
  const units = sections.flatMap(splitLongSection)
  return mergeShortUnits(units).map((unit) => buildChunk(unit, documentTitle))
}
