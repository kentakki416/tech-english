"use client"

import { useEffect, useEffectEvent } from "react"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

/**
 * 入力欄・ボタン・リンクにフォーカスがあるときは、Space / Enter をその要素の操作に任せる
 */
const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))

/**
 * 単語帳の 1 枚のキーボード操作（vocabulary-cards README「UI 設計 > 1 回分」）。
 * `Space` / `Enter` めくる（めくった後なら表に戻す）、`→` 覚えた、`←` まだ（答えは呼ばれた側がめくった後だけ受け付ける）。
 * IME の変換中・修飾キーつき・押しっぱなしの繰り返しは無視する
 */
export function useVocabularyShortcuts({ onAnswer, onFlip }: { onAnswer: (grade: ReviewVocabularyCardRequest["grade"]) => void, onFlip: () => void }): void {
  /**
   * 見ていた秒数で毎秒描き直されても keydown の登録をやり直さないよう、最新の関数を読む Effect Event にする
   */
  const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === " " || event.key === "Enter") {
      if (isInteractiveTarget(event.target)) return
      event.preventDefault()
      onFlip()
    } else if (event.key === "ArrowRight") {
      onAnswer("remembered")
    } else if (event.key === "ArrowLeft") {
      onAnswer("forgot")
    }
  })

  useEffect(() => {
    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  }, [])
}
