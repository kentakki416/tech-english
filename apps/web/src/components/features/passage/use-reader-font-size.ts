"use client"

import { useCallback, useSyncExternalStore } from "react"

import type { ReaderFontSize } from "./PassageReader"

/**
 * 本文の文字サイズの設定。端末（localStorage）に保存する
 */
const FONT_SIZE_STORAGE_KEY = "reader-font-size"

const DEFAULT_FONT_SIZE: ReaderFontSize = "md"

const FONT_SIZES: readonly ReaderFontSize[] = ["sm", "md", "lg"]

const listeners = new Set<() => void>()

/**
 * このタブで選んだサイズ。localStorage が使えない（プライベートブラウズ・容量超過）ときも、開いている間は選んだサイズを保つ
 */
let selectedFontSize: ReaderFontSize | null = null

const isReaderFontSize = (value: unknown): value is ReaderFontSize => FONT_SIZES.includes(value as ReaderFontSize)

const readFontSize = (): ReaderFontSize => {
  if (selectedFontSize !== null) return selectedFontSize
  try {
    const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    if (isReaderFontSize(stored)) return stored
  } catch {
  }
  return DEFAULT_FONT_SIZE
}

/**
 * サーバーと hydration 中は「中」（サーバーの HTML とのずれを防ぐ）
 */
const readServerFontSize = (): ReaderFontSize => DEFAULT_FONT_SIZE

const subscribeFontSize = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useReaderFontSize(): [ReaderFontSize, (fontSize: ReaderFontSize) => void] {
  const fontSize = useSyncExternalStore(subscribeFontSize, readFontSize, readServerFontSize)

  const changeFontSize = useCallback((next: ReaderFontSize) => {
    selectedFontSize = next
    try {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, next)
    } catch {
      /**
       * 保存できなくても、開いている間は selectedFontSize で効く（次に開いたときは「中」に戻る）
       */
    }
    listeners.forEach(listener => listener())
  }, [])

  return [fontSize, changeFontSize]
}
