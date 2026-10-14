"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * 本文をスクロールするキー。読み上げ中に押されたら自動スクロールを止める
 */
const SCROLL_KEYS = ["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]

/**
 * 入力欄で打ったキーはスクロールではない
 */
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))

/**
 * ボタン・リンクにフォーカスがあるときの Space は押す操作で、スクロールしない
 */
const isActivatableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest("a, button, [role='button'], [role='menuitemradio']") !== null

/**
 * 段落の始まりが画面の上の方に来るまでスクロールする（section の scroll-mt-24 で上に余白が残る）。
 * 視差効果を減らす設定のときはアニメーションさせない
 */
const scrollToBlock = (blockIndex: number) => {
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
  document.getElementById(`block-${blockIndex}`)?.scrollIntoView({ behavior, block: "start" })
}

/**
 * 読み上げ中の段落を追ってスクロールする。ユーザーが本文を動かしたら止め、「読み上げ中の位置に戻る」で再開する。
 * scrollIntoView が起こすスクロールは scroll イベントだけなので、wheel / touchmove / キーで見分ける
 */
export function useReadingAutoScroll(activeBlockIndex: number | null): {
  isFollowing: boolean
  /**
   * 本文のスクロール領域（main）に付ける
   */
  scrollHandlers: { onTouchMove: () => void, onWheel: () => void }
  resumeFollowing: () => void
} {
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
    scrollToBlock(activeBlockIndex)
  }, [activeBlockIndex, isFollowing])

  useEffect(() => {
    if (!isReading) return
    const stopOnScrollKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return
      if (event.key === " " && isActivatableTarget(event.target)) return
      if (SCROLL_KEYS.includes(event.key)) setIsFollowing(false)
    }
    window.addEventListener("keydown", stopOnScrollKey)
    return () => window.removeEventListener("keydown", stopOnScrollKey)
  }, [isReading])

  const scrollHandlers = useMemo(() => {
    const stopFollowing = () => {
      if (isReading) setIsFollowing(false)
    }
    return { onTouchMove: stopFollowing, onWheel: stopFollowing }
  }, [isReading])

  /**
   * 追うのを再開する。追っていなかったときは、上の Effect がすぐに読み上げ中の段落までスクロールする
   */
  const resumeFollowing = useCallback(() => setIsFollowing(true), [])

  return { isFollowing, resumeFollowing, scrollHandlers }
}
