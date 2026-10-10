"use client"

import { useEffect } from "react"

import { setupEventFlushOnHide } from "@/libs/event-tracker"

/**
 * ページが隠れる / 破棄されるときにイベントバッファを flush する。
 *
 * ルートレイアウトに 1 つだけ置く。これが無いとタブを閉じた瞬間の
 * バッファが失われる。購読するイベントは setupEventFlushOnHide 側に持つ。
 */
export function EventFlushOnHide() {
  useEffect(() => setupEventFlushOnHide(), [])
  return null
}
