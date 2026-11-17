"use client"

import { useEffect } from "react"

import { setupEventFlushOnHide } from "@/libs/event-tracker"

/**
 * ルートレイアウトに 1 つだけ置く。これが無いとタブを閉じた瞬間のバッファが失われる
 */
export function EventFlushOnHide() {
  useEffect(() => setupEventFlushOnHide(), [])
  return null
}
