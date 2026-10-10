import type { CreateEventRequest } from "@repo/api-schema"

/** API が受け取る 1 件のイベント。イベント名の union もここから派生する */
export type EventInput = CreateEventRequest["events"][number]

/** バッファがこの件数に達したら即座に送る */
const FLUSH_THRESHOLD = 10

/** 操作が止まってもこの間隔で送る */
const FLUSH_INTERVAL_MS = 5000

const EVENTS_ENDPOINT = "/api/events"

let buffer: EventInput[] = []
let timer: ReturnType<typeof setTimeout> | null = null

/** 離脱時は通常の fetch が中断されうるため sendBeacon を優先する */
const flushEvents = (): void => {
  if (buffer.length === 0) return

  const payload = JSON.stringify({ events: buffer })
  buffer = []
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }

  const blob = new Blob([payload], { type: "application/json" })
  if (navigator.sendBeacon?.(EVENTS_ENDPOINT, blob)) return

  void fetch(EVENTS_ENDPOINT, {
    body: payload,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => {
    /** 分析イベントの失敗はユーザーに影響させない */
  })
}

/** **await しない前提で呼ぶ。** 10 件 / 5 秒 / タブが hidden のいずれかで flush する */
export const trackEvent = (event: Omit<EventInput, "occurredAt">): void => {
  buffer.push({ ...event, occurredAt: new Date().toISOString() })

  if (buffer.length >= FLUSH_THRESHOLD) {
    flushEvents()
    return
  }
  timer ??= setTimeout(flushEvents, FLUSH_INTERVAL_MS)
}

/**
 * アプリのルートで 1 回呼ぶ。これが無いとタブを閉じた瞬間のバッファが失われる。
 *
 * **pagehide も購読する。** iOS Safari は visibilitychange が発火しないことがあり、
 * それだけではモバイル閲覧を取りこぼす。flushEvents はバッファが空なら即 return
 * するので二重送信にはならない。
 */
export const setupEventFlushOnHide = (): (() => void) => {
  const flushWhenHidden = (): void => {
    if (document.visibilityState === "hidden") flushEvents()
  }
  document.addEventListener("visibilitychange", flushWhenHidden)
  window.addEventListener("pagehide", flushEvents)
  return () => {
    document.removeEventListener("visibilitychange", flushWhenHidden)
    window.removeEventListener("pagehide", flushEvents)
  }
}
