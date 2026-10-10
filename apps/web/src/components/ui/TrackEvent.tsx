"use client"

import { useEffect, useRef } from "react"

import { trackEvent, type EventInput } from "@/libs/event-tracker"

type Props = {
  name: EventInput["name"]
  properties?: EventInput["properties"]
}

/**
 * マウント時に 1 回送出する。**イベントごとに専用コンポーネントを作らない。**
 * 命令的に送りたい場合は `trackEvent()` を直接呼ぶ。
 *
 * Client Component なのは、Server Component 側で送るとプリフェッチや
 * キャッシュヒットでも記録され、実際には見ていない閲覧が混入するため。
 */
export function TrackEvent({ name, properties }: Props) {
  /** Strict Mode は useEffect を 2 回実行するため、ref でガードしないと 2 件記録される */
  const key = JSON.stringify({ name, properties })
  const sentKey = useRef<string | null>(null)

  useEffect(() => {
    if (sentKey.current === key) return
    sentKey.current = key
    trackEvent(JSON.parse(key) as Omit<EventInput, "occurredAt">)
  }, [key])

  return null
}
