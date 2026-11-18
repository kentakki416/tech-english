"use client"

import { useEffect } from "react"

import { removeAttemptProgress } from "@/features/attempt/attempt-progress"

export function ClearAttemptProgress({ attemptId }: { attemptId: number }) {
  useEffect(() => {
    removeAttemptProgress(attemptId)
  }, [attemptId])
  return null
}
