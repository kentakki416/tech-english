import { Fragment, useMemo } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import type { MockGlossaryEntry, MockPassageBlock } from "@/libs/mock-data"

import { lookUpDictionary, type Segment, segmentText } from "./passage-text"

export type WordCardContent = {
  lemma?: string
  meaningJa?: string
  noteJa?: string
  partOfSpeech?: string
  source: "dictionary" | "glossary" | "not_found"
  surface: string
}

const CODE_TOKEN_PATTERN = /(\/\/.*$)|("[^"]*")|\b(function|const|let|return|import|from|export)\b|\b([A-Za-z_]\w*)(?=\()/gm

function HighlightedCode({ code }: { code: string }) {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (const match of code.matchAll(CODE_TOKEN_PATTERN)) {
    const index = match.index ?? 0
    nodes.push(code.slice(cursor, index))
    const color = match[1] ? MOCK_COLORS.codeComment : match[2] ? MOCK_COLORS.codeString : match[3] ? MOCK_COLORS.codeKeyword : MOCK_COLORS.codeFn
    nodes.push(<Text key={index} style={{ color }}>{match[0]}</Text>)
    cursor = index + match[0].length
  }
  nodes.push(code.slice(cursor))
  return <Text style={styles.code}>{nodes}</Text>
}

/**
 * 段落番号（見出しとコードは数えない）。設問の "paragraph 1" と対応する
 */
const numberParagraphs = (blocks: MockPassageBlock[]): (number | null)[] => {
  let count = 0
  return blocks.map(block => (block.type === "code" || block.type === "heading" ? null : ++count))
}

/**
 * 本文を表示する。段落番号の列・段落ごとの「訳」・長押しで和訳の一時表示・単語のタップ・根拠のハイライトを持つ
 *
 * 単語は入れ子の <Text onPress> にする（RN の Text は選択範囲を取得できないため、単語単位で押させる）。
 */
export function PassageReader({
  blocks,
  dictionary,
  fontSize = 17,
  glossary,
  hiddenGlossaryIds = [],
  highlight = null,
  peekBlock = null,
  showAllTranslations = false,
  translatedBlocks,
  onBlockLayout,
  onPeekEnd,
  onPeekStart,
  onToggleTranslation,
  onWordPress,
}: {
  blocks: MockPassageBlock[]
  dictionary: Record<string, string>
  fontSize?: number
  glossary: MockGlossaryEntry[]
  hiddenGlossaryIds?: number[]
  highlight?: { blockIndex: number, quote: string } | null
  peekBlock?: number | null
  showAllTranslations?: boolean
  translatedBlocks: Set<number>
  onBlockLayout?: (blockIndex: number, y: number) => void
  onPeekEnd?: () => void
  onPeekStart?: (blockIndex: number) => void
  onToggleTranslation?: (blockIndex: number) => void
  onWordPress?: (content: WordCardContent) => void
}) {
  const visibleGlossary = useMemo(() => glossary.filter(entry => !hiddenGlossaryIds.includes(entry.id)), [glossary, hiddenGlossaryIds])
  const paragraphNumbers = useMemo(() => numberParagraphs(blocks), [blocks])
  const lineHeight = Math.round(fontSize * 1.75)

  const pressWord = (segment: Segment) => {
    const entry = visibleGlossary.find(item => item.id === segment.glossaryId)
    if (entry) {
      onWordPress?.({ lemma: entry.lemma, meaningJa: entry.meaningJa, noteJa: entry.noteJa, partOfSpeech: entry.partOfSpeech, source: "glossary", surface: segment.text })
      return
    }
    const result = lookUpDictionary(segment.text, dictionary)
    onWordPress?.(result ? { lemma: result.lemma, meaningJa: result.meaningJa, source: "dictionary", surface: segment.text } : { source: "not_found", surface: segment.text })
  }

  const renderSegments = (segments: Segment[], blockIndex: number, isHighlighted = false) =>
    segments.map((segment, index) => {
      const highlightStyle = isHighlighted ? styles.highlight : undefined
      if (segment.kind === "code") {
        return <Text key={index} style={[styles.inlineCode, { fontSize: fontSize * 0.82 }]}>{segment.text}</Text>
      }
      if (segment.kind !== "word") {
        return <Text key={index} style={highlightStyle}>{segment.text}</Text>
      }
      return (
        <Text
          key={index}
          onLongPress={() => onPeekStart?.(blockIndex)}
          onPress={() => pressWord(segment)}
          onPressOut={onPeekEnd}
          style={highlightStyle}
        >
          {segment.text}
        </Text>
      )
    })

  return (
    <View>
      {blocks.map((block, blockIndex) => {
        const isCode = block.type === "code"
        const isHeading = block.type === "heading"
        const isTranslated = !isCode && (showAllTranslations || translatedBlocks.has(blockIndex))
        const isPeeking = peekBlock === blockIndex && !isTranslated
        const quote = highlight?.blockIndex === blockIndex && block.text.includes(highlight.quote) ? highlight.quote : null

        return (
          <View key={blockIndex} onLayout={event => onBlockLayout?.(blockIndex, event.nativeEvent.layout.y)} style={styles.blockRow}>
            <View style={[styles.gutter, { paddingTop: isHeading ? 8 : 6 }]}>
              {isHeading && <Text style={styles.gutterText}>#</Text>}
              {paragraphNumbers[blockIndex] !== null && <Text style={styles.gutterText}>{paragraphNumbers[blockIndex]}</Text>}
              {!isCode && onToggleTranslation && (
                <Pressable
                  accessibilityLabel={isTranslated ? "英文に戻す" : "この段落を和訳で表示"}
                  hitSlop={8}
                  onPress={() => onToggleTranslation(blockIndex)}
                  style={[styles.translateButton, isTranslated && styles.translateButtonActive]}
                >
                  <Text style={[styles.translateButtonText, isTranslated && { color: MOCK_COLORS.amber }]}>訳</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.blockBody}>
              {isCode ? (
                <ScrollView horizontal style={styles.codeBlock}>
                  <HighlightedCode code={block.text} />
                </ScrollView>
              ) : isTranslated ? (
                <Text style={[styles.translation, isHeading && { fontWeight: "600" }, { fontSize: fontSize * 0.92, lineHeight: Math.round(fontSize * 1.8) }]}>
                  {segmentText(block.translationJa ?? "", []).map((segment, index) =>
                    segment.kind === "code"
                      ? <Text key={index} style={[styles.inlineCode, { fontSize: fontSize * 0.78 }]}>{segment.text}</Text>
                      : <Fragment key={index}>{segment.text}</Fragment>)}
                </Text>
              ) : (
                <View>
                  <Text
                    onLongPress={() => onPeekStart?.(blockIndex)}
                    onPressOut={onPeekEnd}
                    style={[
                      isHeading ? styles.heading : styles.paragraph,
                      isHeading ? { fontSize: fontSize * 1.45, lineHeight: Math.round(fontSize * 1.8) } : { fontSize, lineHeight },
                    ]}
                  >
                    {quote ? (
                      <>
                        {renderSegments(segmentText(block.text.slice(0, block.text.indexOf(quote)), visibleGlossary), blockIndex)}
                        {renderSegments(segmentText(quote, visibleGlossary), blockIndex, true)}
                        {renderSegments(segmentText(block.text.slice(block.text.indexOf(quote) + quote.length), visibleGlossary), blockIndex)}
                      </>
                    ) : (
                      renderSegments(segmentText(block.text, visibleGlossary), blockIndex)
                    )}
                  </Text>
                  {isPeeking && (
                    <View pointerEvents="none" style={styles.peek}>
                      <Text style={[styles.translation, { fontSize: fontSize * 0.92, lineHeight: Math.round(fontSize * 1.8) }]}>{block.translationJa}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/**
 * 単語のカード（画面の下端に全幅で出す）
 */
export function WordCard({ content, onClose }: { content: WordCardContent, onClose: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardSurface}>{content.surface}</Text>
          {content.source !== "not_found" && (
            <Text style={styles.cardMeta}>
              {content.lemma && content.lemma !== content.surface.toLowerCase() ? `${content.lemma}  ` : ""}
              {content.partOfSpeech ?? ""}
            </Text>
          )}
        </View>
        <Pressable accessibilityLabel="閉じる" hitSlop={12} onPress={onClose}>
          <Text style={styles.cardClose}>×</Text>
        </Pressable>
      </View>
      {content.source === "not_found" ? (
        <Text style={styles.cardNote}>辞書に見つかりませんでした。</Text>
      ) : (
        <>
          <Text style={styles.cardMeaning}>{content.meaningJa}</Text>
          {content.noteJa && <Text style={styles.cardNote}>{content.noteJa}</Text>}
        </>
      )}
      <View style={styles.cardSource}>
        <View style={[styles.cardDot, { backgroundColor: content.source === "glossary" ? MOCK_COLORS.amber : MOCK_COLORS.fgFaint }]} />
        <Text style={{ color: content.source === "glossary" ? MOCK_COLORS.amber : MOCK_COLORS.fgFaint, fontSize: 11 }}>
          {content.source === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）"}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  blockBody: {
    flex: 1,
    minWidth: 0,
  },
  blockRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  card: {
    backgroundColor: MOCK_COLORS.raised,
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
  },
  cardClose: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 22,
    lineHeight: 22,
  },
  cardDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
  },
  cardMeaning: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  cardMeta: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
    marginTop: 2,
  },
  cardNote: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  cardSource: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  cardSurface: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.readingSemiBold,
    fontSize: 20,
  },
  code: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.code,
    fontSize: 12.5,
    lineHeight: 21,
  },
  codeBlock: {
    backgroundColor: MOCK_COLORS.surface,
    borderColor: MOCK_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  gutter: {
    alignItems: "flex-end",
    gap: 6,
    paddingRight: 10,
    width: 40,
  },
  gutterText: {
    color: MOCK_COLORS.fgFaint,
    fontFamily: MOCK_FONTS.code,
    fontSize: 11,
  },
  heading: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.readingSemiBold,
  },
  highlight: {
    backgroundColor: "rgba(243, 178, 76, 0.22)",
  },
  inlineCode: {
    backgroundColor: MOCK_COLORS.surface,
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.code,
  },
  paragraph: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
  },
  peek: {
    backgroundColor: MOCK_COLORS.canvas,
    left: 0,
    minHeight: "100%",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  translateButton: {
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    opacity: 0.7,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  translateButtonActive: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.5)",
    opacity: 1,
  },
  translateButtonText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 11,
  },
  translation: {
    borderColor: "rgba(243, 178, 76, 0.5)",
    borderLeftWidth: 2,
    color: MOCK_COLORS.fg,
    paddingLeft: 12,
  },
})
