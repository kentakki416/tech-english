import { useCallback, useEffect, useState } from "react"
import type { FlatList } from "react-native"
import { useReducedMotion } from "react-native-reanimated"

import type { AttemptBlock } from "@repo/api-schema"

import { BLOCK_SCROLL_VIEW_OFFSET } from "@/components/features/passage/PassageReader"

/**
 * 読み上げ中の段落を追ってスクロールする。ユーザーが本文を指で動かし始めたら止め、「読み上げ中の位置に戻る」で再開する（web の同名の hook と同じ振る舞い）
 *
 * - 段落の始まりを「本文の根拠を見る」と同じ位置（BLOCK_SCROLL_VIEW_OFFSET）に合わせる。まだ描画していない遠いブロックは PassageReader の onScrollToIndexFailed がやり直す
 * - OS の「視差効果を減らす」のときはアニメーションさせない
 * - scrollToIndex は drag を起こさないので、自動スクロールでは止まらない
 */
export function useReadingAutoScroll(
  listRef: React.RefObject<FlatList<AttemptBlock> | null>,
  activeBlockIndex: number | null,
): {
  isFollowing: boolean
  /**
   * PassageReader の onScrollBeginDrag に渡す
   */
  onScrollBeginDrag: () => void
  resumeFollowing: () => void
} {
  const isReducedMotion = useReducedMotion()
  const [isFollowing, setIsFollowing] = useState(true)
  const [previousBlockIndex, setPreviousBlockIndex] = useState(activeBlockIndex)
  const isReading = activeBlockIndex !== null

  /**
   * 読み上げが終わったら追う状態に戻す（描画中に前の値と比べて直す。Effect で直すと 1 回余分に描き直すため）
   */
  if (previousBlockIndex !== activeBlockIndex) {
    setPreviousBlockIndex(activeBlockIndex)
    if (activeBlockIndex === null) setIsFollowing(true)
  }

  /**
   * 読み上げ中の段落が変わったとき・追うのを再開したときに、その段落までスクロールする
   */
  useEffect(() => {
    if (activeBlockIndex === null || !isFollowing) return
    listRef.current?.scrollToIndex({ animated: !isReducedMotion, index: activeBlockIndex, viewOffset: BLOCK_SCROLL_VIEW_OFFSET })
  }, [activeBlockIndex, isFollowing, isReducedMotion, listRef])

  /**
   * 読み上げ中に指で本文を動かし始めたら追うのを止める
   */
  const onScrollBeginDrag = useCallback(() => {
    if (isReading) setIsFollowing(false)
  }, [isReading])

  /**
   * 追うのを再開する。追っていなかったときは、上の Effect がすぐに読み上げ中の段落までスクロールする
   */
  const resumeFollowing = useCallback(() => setIsFollowing(true), [])

  return { isFollowing, onScrollBeginDrag, resumeFollowing }
}
