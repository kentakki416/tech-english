"use client"

import { useEffect } from "react"

import { removeAttemptProgress } from "@/features/attempt/attempt-progress"

/**
 * 結果画面を開いたら、端末（localStorage）に保存した挑戦の途中経過を消す。何も描画しない。
 * 提出の Server Action では消さない（提出に失敗したときに回答を失わないよう、提出が通って結果画面に来てから消す）
 */
export function ClearAttemptProgress({ attemptId }: { attemptId: number }) {
  useEffect(() => {
    removeAttemptProgress(attemptId)
  }, [attemptId])
  return null
}
