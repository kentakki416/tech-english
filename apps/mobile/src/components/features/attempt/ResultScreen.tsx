import * as Haptics from "expo-haptics"
import { useCallback, useMemo, useRef, useState } from "react"
import { type FlatList, Platform, StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { AttemptBlock, ResultQuestion, SubmittedAttempt } from "@repo/api-schema"

import {
  BLOCK_SCROLL_VIEW_OFFSET,
  PassageReader,
  type ReaderHighlight,
  type ReaderReadAloud,
} from "@/components/features/passage/PassageReader"
import { useWordCard, WordCard } from "@/components/features/passage/WordCard"
import {
  READ_ALOUD_BAR_GAP,
  READ_ALOUD_BAR_SPACE,
  ReadAloudBar,
  ReturnToReadingButton,
} from "@/components/features/read-aloud/ReadAloudBar"
import { useDictionaryLookup } from "@/features/dictionary/use-dictionary-lookup"
import { useReadAloud } from "@/features/read-aloud/use-read-aloud"
import { useReadingAutoScroll } from "@/features/read-aloud/use-reading-auto-scroll"

import { ResultBottomBar } from "./ResultBottomBar"
import { ResultHeader } from "./ResultHeader"
import { ResultTopBar } from "./ResultTopBar"

/**
 * 本文の右の余白（モックの本文の区画と同じ）。本文より上の区画はこの分だけ右にはみ出させて全幅にする
 */
const PASSAGE_PADDING_RIGHT = 18

/**
 * 本文の下端の余白（下端の操作の上に浮かべた読み上げのミニプレーヤーの分は別に足す）
 */
const CONTENT_BOTTOM_SPACE = 32

/**
 * 結果・解説画面の本体（提出済みの挑戦を受け取ってから描画する）。
 * 本文の FlatList（PassageReader）1 つに全体を載せ、本文より上の区画（スコアと時間・設問ごとの結果・調べた単語・出典）を
 * ListHeaderComponent にする（ScrollView の中に FlatList を入れると画面外のブロックも描画されてしまうため）。
 *
 * - 最初は最初の不正解の設問の根拠をハイライトする（スクロールはしない。画面の上から読み始めるため）
 * - 「本文の根拠を見る」でその設問の根拠をハイライトし、根拠のブロックまで scrollToIndex する
 * - 本文は解答画面と同じ部品で、単語のカード・段落の「訳」・長押しの和訳・読み上げが使える。
 *   調べた単語・聞いた段落は記録しない（onLookupWord・onBlockListened を渡さない）。開いただけでは再生しない
 * - 読み上げのミニプレーヤーは下端の操作（もう一度解く・次の問題を解く）の上に浮かべる
 */
export function ResultScreen({ result }: { result: SubmittedAttempt }) {
  const readerRef = useRef<FlatList<AttemptBlock>>(null)
  const lookupDictionary = useDictionaryLookup()
  const { closeWordCard, showWordCard, wordCard } = useWordCard()
  const { blocks, questions } = result
  /**
   * 結果画面で聞いた段落は数えない（onBlockListened を渡さない）
   */
  const readAloud = useReadAloud({ attemptId: result.id, blocks })
  const { playBlock: playReadAloudBlock } = readAloud
  const autoScroll = useReadingAutoScroll(readerRef, readAloud.playback?.blockIndex ?? null)
  const { resumeFollowing } = autoScroll

  const [highlightQuestionId, setHighlightQuestionId] = useState<number | null>(
    () => questions.find(question => !question.is_correct && question.evidence !== null)?.id ?? null,
  )
  /**
   * いま和訳を表示している段落
   */
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(() => new Set())
  /**
   * 長押しで和訳を重ねている段落
   */
  const [peekBlock, setPeekBlock] = useState<number | null>(null)

  /**
   * 和訳のあるブロック（code 以外）。長押しの和訳はこのブロックだけ
   */
  const translatableBlockIndexes = useMemo(
    () => new Set(blocks.flatMap((block, index) => (block.type !== "code" && block.translation_ja !== null ? [index] : []))),
    [blocks],
  )

  const highlight = useMemo<ReaderHighlight | null>(() => {
    const evidence = questions.find(question => question.id === highlightQuestionId)?.evidence
    return evidence ? { blockIndex: evidence.block_index, segmentEnd: evidence.segment_end, segmentStart: evidence.segment_start } : null
  }, [highlightQuestionId, questions])

  /**
   * まだ描画していない遠いブロックへの scrollToIndex は PassageReader がやり直す（onScrollToIndexFailed）
   */
  const showEvidence = useCallback((question: ResultQuestion) => {
    if (!question.evidence) return
    setHighlightQuestionId(question.id)
    const blockIndex = question.evidence.block_index
    if (blockIndex < 0 || blockIndex >= blocks.length) return
    readerRef.current?.scrollToIndex({ animated: true, index: blockIndex, viewOffset: BLOCK_SCROLL_VIEW_OFFSET })
  }, [blocks.length])

  const toggleTranslation = useCallback((blockIndex: number) => {
    setTranslatedBlocks((current) => {
      const next = new Set(current)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
  }, [])

  /**
   * 長押しが成立したら軽く振動して、押している間だけ和訳を重ねる
   */
  const startPeek = useCallback((blockIndex: number) => {
    if (!translatableBlockIndexes.has(blockIndex)) return
    setPeekBlock(blockIndex)
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [translatableBlockIndexes])

  const endPeek = useCallback(() => setPeekBlock(null), [])

  /**
   * 待機中に再生を始めるときは、読み上げ中の段落を追うスクロールを再開する
   */
  const toggleReadAloud = () => {
    if (readAloud.playback === null) resumeFollowing()
    readAloud.togglePlay()
  }

  /**
   * 本文の行は memo されているので、参照を変えないよう useCallback にする
   */
  const playBlock = useCallback((blockIndex: number) => {
    resumeFollowing()
    playReadAloudBlock(blockIndex)
  }, [playReadAloudBlock, resumeFollowing])

  const readerReadAloud: ReaderReadAloud = {
    activeBlockIndex: readAloud.playback?.blockIndex ?? null,
    isAvailable: readAloud.availability === "ready",
    playingBlockIndex: readAloud.playback?.mode === "block" && readAloud.playback.isPlaying ? readAloud.playback.blockIndex : null,
    reading: readAloud.reading,
    onPlayBlock: playBlock,
  }

  /**
   * 本文より上の区画。単語のカード・長押しで作り直さない（FlatList のヘッダーの描き直しを避ける）
   */
  const header = useMemo(() => (
    <View style={styles.header}>
      <ResultHeader highlightQuestionId={highlightQuestionId} result={result} onShowEvidence={showEvidence} />
    </View>
  ), [highlightQuestionId, result, showEvidence])

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ResultTopBar />

      <View style={styles.body}>
        <PassageReader
          ref={readerRef}
          ListHeaderComponent={header}
          blocks={blocks}
          contentContainerStyle={styles.content}
          glossary={result.glossary}
          highlight={highlight}
          peekBlock={peekBlock}
          readAloud={readerReadAloud}
          translatedBlocks={translatedBlocks}
          onLookupDictionary={lookupDictionary}
          onPeekEnd={endPeek}
          onPeekStart={startPeek}
          onScrollBeginDrag={autoScroll.onScrollBeginDrag}
          onToggleTranslation={toggleTranslation}
          onWordCard={showWordCard}
        />

        {/**
          * body は下端の操作の上で終わるので、その上に浮かぶ。単語のカード（zIndex 35）より下に重ねる
          */}
        <View style={styles.readAloudWrapper}>
          {readAloud.playback !== null && !autoScroll.isFollowing && <ReturnToReadingButton onPress={resumeFollowing} />}
          <ReadAloudBar
            availability={readAloud.availability}
            blocks={blocks}
            playback={readAloud.playback}
            progress={readAloud.progress}
            rate={readAloud.rate}
            onRateCycle={readAloud.cycleRate}
            onStop={readAloud.stop}
            onToggle={toggleReadAloud}
          />
        </View>

        {wordCard && (
          <View style={styles.wordCardWrapper}>
            <WordCard content={wordCard} onClose={closeWordCard} />
          </View>
        )}
      </View>

      <ResultBottomBar passageId={result.passage.id} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  content: {
    paddingBottom: READ_ALOUD_BAR_SPACE + CONTENT_BOTTOM_SPACE,
    paddingRight: PASSAGE_PADDING_RIGHT,
  },
  header: {
    marginRight: -PASSAGE_PADDING_RIGHT,
  },
  readAloudWrapper: {
    bottom: READ_ALOUD_BAR_GAP,
    left: 12,
    pointerEvents: "box-none",
    position: "absolute",
    right: 12,
    zIndex: 30,
  },
  screen: {
    flex: 1,
  },
  wordCardWrapper: {
    bottom: READ_ALOUD_BAR_SPACE,
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 35,
  },
})
