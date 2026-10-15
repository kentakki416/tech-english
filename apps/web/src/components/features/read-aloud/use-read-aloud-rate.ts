"use client"

import { useCallback, useSyncExternalStore } from "react"

export type ReadAloudRate = 0.75 | 1 | 1.25

export const READ_ALOUD_RATES: readonly ReadAloudRate[] = [0.75, 1, 1.25]

/**
 * 読み上げの速度の設定。端末（localStorage）に保存し、次の挑戦や結果画面でも使う
 */
const RATE_STORAGE_KEY = "read-aloud-rate"

const DEFAULT_RATE: ReadAloudRate = 1

const listeners = new Set<() => void>()

/**
 * このタブで選んだ速度。localStorage が使えない（プライベートブラウズ・容量超過）ときも、開いている間は選んだ速度を保つ
 */
let selectedRate: ReadAloudRate | null = null

const isReadAloudRate = (value: unknown): value is ReadAloudRate => READ_ALOUD_RATES.includes(value as ReadAloudRate)

const readRate = (): ReadAloudRate => {
  if (selectedRate !== null) return selectedRate
  try {
    const stored = Number(window.localStorage.getItem(RATE_STORAGE_KEY))
    if (isReadAloudRate(stored)) return stored
  } catch {
    /**
     * 読めない（プライベートブラウズ等）ときは既定値にする
     */
  }
  return DEFAULT_RATE
}

/**
 * サーバーと hydration 中は 1 倍（サーバーの HTML とのずれを防ぐ）
 */
const readServerRate = (): ReadAloudRate => DEFAULT_RATE

const subscribeRate = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useReadAloudRate(): [ReadAloudRate, (rate: ReadAloudRate) => void] {
  const rate = useSyncExternalStore(subscribeRate, readRate, readServerRate)

  const changeRate = useCallback((next: ReadAloudRate) => {
    selectedRate = next
    try {
      window.localStorage.setItem(RATE_STORAGE_KEY, String(next))
    } catch {
      /**
       * 保存できなくても、開いている間は selectedRate で効く（次に開いたときは 1 倍に戻る）
       */
    }
    listeners.forEach(listener => listener())
  }, [])

  return [rate, changeRate]
}
