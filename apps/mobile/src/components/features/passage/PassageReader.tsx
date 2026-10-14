import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItem,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native"

import type { AttemptBlock, AttemptGlossaryEntry, PassageSegmentResponse } from "@repo/api-schema"

import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import type { WordLookupRecord } from "@/features/attempt/attempt-progress"
import type { LookupDictionary } from "@/features/dictionary/use-dictionary-lookup"

import { splitInlineCode } from "./passage-text"
import type { WordCardContent } from "./WordCard"

/**
 * 根拠のハイライト。blockIndex のブロックで、セグメントの添字が [segmentStart, segmentEnd) の範囲
 */
export type ReaderHighlight = {
  blockIndex: number
  segmentEnd: number
  segmentStart: number
}

type PassageReaderProps = {
  blocks: AttemptBlock[]
  /**
   * 本文の FlatList の余白（画面ごとに上下の区画が違うため）
   */
  contentContainerStyle?: StyleProp<ViewStyle>
  fontSize?: number
  glossary: AttemptGlossaryEntry[]
  /**
   * 結果画面の根拠。セグメントの添字の範囲
   */
  highlight?: ReaderHighlight | null
  ListFooterComponent?: React.ReactElement
  ListHeaderComponent?: React.ReactElement
  peekBlock?: number | null
  /**
   * React 19 なので forwardRef を使わず props で受ける（結果画面の scrollToIndex に使う。viewOffset は BLOCK_SCROLL_VIEW_OFFSET）
   */
  ref?: React.Ref<FlatList<AttemptBlock>>
  /**
   * 縦の ScrollView の中に置くとき（ログイン画面のデモ）は false にする。入れ子の VirtualizedList の警告を出さないため
   */
  scrollEnabled?: boolean
  showAllTranslations?: boolean
  translatedBlocks: Set<number>
  /**
   * 用語集に無い単語を引く。親がキャッシュと通信を持つ（useDictionaryLookup）
   */
  onLookupDictionary: LookupDictionary
  /**
   * 意味が見つかったときだけ呼ぶ（解答画面が調べた単語として記録する）
   */
  onLookupWord?: (lookup: WordLookupRecord) => void
  onPeekEnd?: () => void
  onPeekStart?: (blockIndex: number) => void
  onToggleTranslation?: (blockIndex: number) => void
  /**
   * 単語のカードを出す・中身を差し替える。辞書は結果を待つ間 loading で 1 回、届いたら同じ requestId でもう 1 回呼ぶ
   */
  onWordCard: (content: WordCardContent) => void
}

type BlockRowProps = {
  block: AttemptBlock
  blockIndex: number
  fontSize: number
  /**
   * このブロックの根拠の範囲。根拠が別のブロックなら null
   */
  highlightEnd: number | null
  highlightStart: number | null
  isPeeking: boolean
  isTranslated: boolean
  onPeekEnd?: () => void
  onPeekStart?: (blockIndex: number) => void
  onPressWord: (segment: PassageSegmentResponse) => void
  onToggleTranslation?: (blockIndex: number) => void
}

type SegmentTextProps = {
  blockIndex: number
  fontSize: number
  isHighlighted: boolean
  segment: PassageSegmentResponse
  onPeekEnd?: () => void
  onPeekStart?: (blockIndex: number) => void
  onPressWord: (segment: PassageSegmentResponse) => void
}

const DEFAULT_FONT_SIZE = 17

/**
 * scrollToIndex でブロックを出すときの上の余白（ブロックを画面の上端に貼り付けない）。
 * まだ描画していないブロックへの scrollToIndex をやり直すときもこの値を使うので、呼び出し側も同じ値を渡す
 */
export const BLOCK_SCROLL_VIEW_OFFSET = 80

/**
 * まだ描画していないブロックへの scrollToIndex をやり直すまでの時間（見積もった位置までスクロールして描画させる間）
 */
const SCROLL_TO_INDEX_RETRY_DELAY_MS = 100

/**
 * scrollToIndex をやり直す回数の上限（描画が追いつかなくても繰り返し続けないため）
 */
const MAX_SCROLL_TO_INDEX_RETRIES = 3

/**
 * 段落の長押しが成立するまでの時間。単語の <Text> の長押しは RN の既定（500ms）で、Text では変えられない
 */
const LONG_PRESS_DELAY_MS = 300

const CODE_TOKEN_PATTERN = /(\/\/.*$)|("[^"]*")|\b(function|const|let|return|import|from|export)\b|\b([A-Za-z_]\w*)(?=\()/gm

/**
 * コードブロックの簡易シンタックスハイライト
 */
function HighlightedCode({ code }: { code: string }) {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (const match of code.matchAll(CODE_TOKEN_PATTERN)) {
    const index = match.index ?? 0
    nodes.push(code.slice(cursor, index))
    const color = match[1] ? THEME_COLORS.codeComment : match[2] ? THEME_COLORS.codeString : match[3] ? THEME_COLORS.codeKeyword : THEME_COLORS.codeFn
    nodes.push(<Text key={index} style={{ color }}>{match[0]}</Text>)
    cursor = index + match[0].length
  }
  nodes.push(code.slice(cursor))
  return <Text style={styles.code}>{nodes}</Text>
}

/**
 * 和訳。インラインコードはバッククォートで分けて等幅にする（表示だけの処理）
 */
function TranslationText({ fontSize, isHeading, text }: { fontSize: number, isHeading: boolean, text: string }) {
  return (
    <Text style={[styles.translation, isHeading && styles.translationHeading, { fontSize: fontSize * 0.92, lineHeight: Math.round(fontSize * 1.8) }]}>
      {splitInlineCode(text).map((part, index) =>
        part.isCode
          ? <Text key={index} style={[styles.inlineCode, { fontSize: fontSize * 0.78 }]}>{part.text}</Text>
          : <Fragment key={index}>{part.text}</Fragment>)}
    </Text>
  )
}

/**
 * 本文の 1 セグメント。単語だけ押せる（入れ子の <Text onPress>。RN の Text は選択範囲を取得できないため、単語単位で押させる）。
 * 単語の上の長押しも段落の和訳にする（RN の Responder は長押しが成立すると onPress を呼ばないので、カードは出ない）
 */
function SegmentText({ blockIndex, fontSize, isHighlighted, segment, onPeekEnd, onPeekStart, onPressWord }: SegmentTextProps) {
  if (segment.kind === "code") {
    return <Text style={[styles.inlineCode, { fontSize: fontSize * 0.82 }, isHighlighted && styles.highlight]}>{segment.text}</Text>
  }
  if (segment.kind !== "word") {
    return isHighlighted ? <Text style={styles.highlight}>{segment.text}</Text> : segment.text
  }
  return (
    <Text
      style={isHighlighted ? styles.highlight : undefined}
      onLongPress={onPeekStart ? () => onPeekStart(blockIndex) : undefined}
      onPress={() => onPressWord(segment)}
      onPressOut={onPeekEnd}
    >
      {segment.text}
    </Text>
  )
}

const MemoizedSegmentText = memo(SegmentText)

/**
 * 本文の 1 ブロック（FlatList の 1 行）。左に段落番号の列と「訳」、右に英文 / 和訳 / コード。
 * 行ごとの値だけを受け取り memo する（1 段落の切り替えや毎秒のタイマーで全行を描き直さないため）
 */
function BlockRow({
  block,
  blockIndex,
  fontSize,
  highlightEnd,
  highlightStart,
  isPeeking,
  isTranslated,
  onPeekEnd,
  onPeekStart,
  onPressWord,
  onToggleTranslation,
}: BlockRowProps) {
  /**
   * 長押しの和訳の高さ。英文より高いときは本文の高さをそこまで広げる（次の行に重ならないように）
   */
  const [peekHeight, setPeekHeight] = useState(0)
  const isCode = block.type === "code"
  const isHeading = block.type === "heading"
  const translation = isCode ? null : block.translation_ja
  const isPeekVisible = isPeeking && !isTranslated && translation !== null

  const measurePeek = useCallback((event: LayoutChangeEvent) => setPeekHeight(event.nativeEvent.layout.height), [])

  return (
    <View style={styles.blockRow}>
      <View style={[styles.gutter, isHeading ? styles.gutterHeading : null]}>
        {isHeading && <Text style={styles.gutterText}>#</Text>}
        {block.paragraph_number !== null && <Text style={styles.gutterText}>{block.paragraph_number}</Text>}
        {translation !== null && onToggleTranslation && (
          <Pressable
            accessibilityLabel={isTranslated ? "英文に戻す" : "この段落を和訳で表示"}
            accessibilityRole="button"
            accessibilityState={{ selected: isTranslated }}
            hitSlop={8}
            style={[styles.translateButton, isTranslated && styles.translateButtonActive]}
            onPress={() => onToggleTranslation(blockIndex)}
          >
            <Text style={[styles.translateButtonText, isTranslated && styles.translateButtonTextActive]}>訳</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.blockBody}>
        {isCode ? (
          <ScrollView horizontal style={styles.codeBlock}>
            <HighlightedCode code={block.text} />
          </ScrollView>
        ) : isTranslated && translation !== null ? (
          <TranslationText fontSize={fontSize} isHeading={isHeading} text={translation} />
        ) : (
          <Pressable
            delayLongPress={LONG_PRESS_DELAY_MS}
            disabled={!onPeekStart}
            style={isPeekVisible && peekHeight > 0 ? { minHeight: peekHeight } : undefined}
            onLongPress={() => onPeekStart?.(blockIndex)}
            onPressOut={onPeekEnd}
          >
            <Text
              style={isHeading
                ? [styles.heading, { fontSize: fontSize * 1.45, lineHeight: Math.round(fontSize * 1.8) }]
                : [styles.paragraph, { fontSize, lineHeight: Math.round(fontSize * 1.75) }]}
            >
              {block.segments.map((segment, index) => (
                <MemoizedSegmentText
                  key={index}
                  blockIndex={blockIndex}
                  fontSize={fontSize}
                  isHighlighted={highlightStart !== null && highlightEnd !== null && index >= highlightStart && index < highlightEnd}
                  segment={segment}
                  onPeekEnd={onPeekEnd}
                  onPeekStart={onPeekStart}
                  onPressWord={onPressWord}
                />
              ))}
            </Text>
            {/**
              * 長押し中の和訳は英文の要素を残したまま上に重ねる（英文を差し替えると押している要素が消えて onPressOut が来なくなるため）
              */}
            {isPeekVisible && (
              <View style={styles.peek} onLayout={measurePeek}>
                <TranslationText fontSize={fontSize} isHeading={isHeading} text={translation} />
              </View>
            )}
          </Pressable>
        )}
      </View>
    </View>
  )
}

const MemoizedBlockRow = memo(BlockRow)

const extractBlockKey = (_block: AttemptBlock, index: number): string => String(index)

/**
 * 本文を表示する。段落番号の列・段落ごとの「訳」・長押しで和訳の一時表示・単語の意味・根拠のハイライトを持つ。
 * セグメントは api が分割したもの（blocks[].segments）をそのまま描画する（分割は api の 1 か所だけ）
 *
 * - ブロックごとに FlatList の 1 行にして、画面外のブロックは描画しない（600 語で入れ子の <Text> が 1,500 程度になるため）
 * - 単語を押すと、用語集の語句（glossary_entry_id）は「この文での意味」、それ以外は onLookupDictionary で英和辞書を引く
 * - 長押しはブロックの本文を包む Pressable と単語の <Text> の両方で受け、押している間だけ和訳を重ねる
 */
export function PassageReader({
  blocks,
  contentContainerStyle,
  fontSize = DEFAULT_FONT_SIZE,
  glossary,
  highlight = null,
  ListFooterComponent,
  ListHeaderComponent,
  peekBlock = null,
  ref,
  scrollEnabled = true,
  showAllTranslations = false,
  translatedBlocks,
  onLookupDictionary,
  onLookupWord,
  onPeekEnd,
  onPeekStart,
  onToggleTranslation,
  onWordCard,
}: PassageReaderProps) {
  /**
   * 押すたびに増やす。辞書の結果が届いたときに、別の単語を押した後なら捨てる
   */
  const requestIdRef = useRef(0)
  const glossaryById = useMemo(() => new Map(glossary.map(entry => [entry.id, entry])), [glossary])

  /**
   * scrollToIndex のやり直しに使う FlatList。props の ref にも同じものを渡す
   */
  const listRef = useRef<FlatList<AttemptBlock> | null>(null)
  /**
   * 本文より上の区画（ListHeaderComponent）の高さ。まだ描画していないブロックの位置の見積もりに足す
   */
  const headerHeightRef = useRef(0)
  /**
   * 実行中の scrollToIndex のやり直しが何回目か。0 は呼び出し側からの scrollToIndex
   * （scrollToIndex は失敗すると同期で onScrollToIndexFailed を呼ぶので、その中で何回目の失敗かが分かる）
   */
  const retryAttemptRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
  }, [])

  const setListRef = useCallback((instance: FlatList<AttemptBlock> | null) => {
    listRef.current = instance
    if (typeof ref === "function") ref(instance)
    else if (ref) ref.current = instance
  }, [ref])

  const measureHeader = useCallback((event: LayoutChangeEvent) => {
    headerHeightRef.current = event.nativeEvent.layout.height
  }, [])

  const header = useMemo(
    () => (ListHeaderComponent ? <View onLayout={measureHeader}>{ListHeaderComponent}</View> : undefined),
    [ListHeaderComponent, measureHeader],
  )

  /**
   * まだ描画していない遠いブロックへの scrollToIndex は失敗する（高さが行ごとに違い getItemLayout を渡せないため）。
   * 描画済みのブロックの平均の高さから見積もった位置まで先にスクロールして描画させ、100ms 後にもう一度 scrollToIndex する
   */
  const retryScrollToIndex = useCallback((info: { averageItemLength: number, index: number }) => {
    const attempt = retryAttemptRef.current + 1
    if (attempt > MAX_SCROLL_TO_INDEX_RETRIES) return
    listRef.current?.scrollToOffset({ animated: false, offset: headerHeightRef.current + info.averageItemLength * info.index })
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      retryAttemptRef.current = attempt
      listRef.current?.scrollToIndex({ animated: true, index: info.index, viewOffset: BLOCK_SCROLL_VIEW_OFFSET })
      retryAttemptRef.current = 0
    }, SCROLL_TO_INDEX_RETRY_DELAY_MS)
  }, [])

  const showDictionaryMeaning = useCallback(async (requestId: number, surface: string) => {
    const isCurrent = () => requestIdRef.current === requestId
    try {
      const result = await onLookupDictionary(surface)
      if (!isCurrent()) return
      if (result === null) {
        onWordCard({ meaning: { status: "not_found" }, requestId, surface })
        return
      }
      onWordCard({ meaning: { lemma: result.headword, meaningJa: result.meaningJa, status: "dictionary" }, requestId, surface })
      onLookupWord?.({ glossaryEntryId: null, lemma: result.headword, source: "dictionary", surface })
    } catch {
      if (isCurrent()) onWordCard({ meaning: { status: "failed" }, requestId, surface })
    }
  }, [onLookupDictionary, onLookupWord, onWordCard])

  const pressWord = useCallback((segment: PassageSegmentResponse) => {
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    const surface = segment.text
    const entry = segment.glossary_entry_id === undefined ? undefined : glossaryById.get(segment.glossary_entry_id)
    if (entry) {
      onWordCard({
        meaning: { lemma: entry.lemma, meaningJa: entry.meaning_ja, noteJa: entry.note_ja, partOfSpeech: entry.part_of_speech, status: "glossary" },
        requestId,
        surface,
      })
      onLookupWord?.({ glossaryEntryId: entry.id, lemma: entry.lemma, source: "glossary", surface })
      return
    }
    /**
     * 結果を待つ間もカードは出し、意味の部分だけ後から埋める
     */
    onWordCard({ meaning: { status: "loading" }, requestId, surface })
    void showDictionaryMeaning(requestId, surface)
  }, [glossaryById, onLookupWord, onWordCard, showDictionaryMeaning])

  const renderItem = useCallback<ListRenderItem<AttemptBlock>>(({ index, item }) => {
    const isHighlighted = highlight?.blockIndex === index
    return (
      <MemoizedBlockRow
        block={item}
        blockIndex={index}
        fontSize={fontSize}
        highlightEnd={isHighlighted ? highlight.segmentEnd : null}
        highlightStart={isHighlighted ? highlight.segmentStart : null}
        isPeeking={peekBlock === index}
        isTranslated={item.type !== "code" && item.translation_ja !== null && (showAllTranslations || translatedBlocks.has(index))}
        onPeekEnd={onPeekEnd}
        onPeekStart={onPeekStart}
        onPressWord={pressWord}
        onToggleTranslation={onToggleTranslation}
      />
    )
  }, [fontSize, highlight, onPeekEnd, onPeekStart, onToggleTranslation, peekBlock, pressWord, showAllTranslations, translatedBlocks])

  return (
    <FlatList
      ref={setListRef}
      ListFooterComponent={ListFooterComponent}
      ListHeaderComponent={header}
      contentContainerStyle={contentContainerStyle}
      data={blocks}
      initialNumToRender={6}
      keyExtractor={extractBlockKey}
      maxToRenderPerBatch={4}
      removeClippedSubviews={Platform.OS === "android"}
      renderItem={renderItem}
      scrollEnabled={scrollEnabled}
      windowSize={7}
      onScrollToIndexFailed={retryScrollToIndex}
    />
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
  code: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.code,
    fontSize: 12.5,
    lineHeight: 21,
  },
  codeBlock: {
    backgroundColor: THEME_COLORS.surface,
    borderColor: THEME_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  gutter: {
    alignItems: "flex-end",
    gap: 6,
    paddingRight: 10,
    paddingTop: 6,
    width: 40,
  },
  gutterHeading: {
    paddingTop: 8,
  },
  gutterText: {
    color: THEME_COLORS.fgFaint,
    fontFamily: THEME_FONTS.code,
    fontSize: 11,
  },
  heading: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.readingSemiBold,
  },
  highlight: {
    backgroundColor: "rgba(243, 178, 76, 0.22)",
  },
  inlineCode: {
    backgroundColor: THEME_COLORS.surface,
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.code,
  },
  paragraph: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
  },
  peek: {
    backgroundColor: THEME_COLORS.canvas,
    left: 0,
    minHeight: "100%",
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  translateButton: {
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    opacity: 0.7,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  translateButtonActive: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.5)",
    opacity: 1,
  },
  translateButtonText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 11,
  },
  translateButtonTextActive: {
    color: THEME_COLORS.amber,
  },
  translation: {
    borderColor: "rgba(243, 178, 76, 0.5)",
    borderLeftWidth: 2,
    color: THEME_COLORS.fg,
    paddingLeft: 12,
  },
  translationHeading: {
    fontWeight: "600",
  },
})
