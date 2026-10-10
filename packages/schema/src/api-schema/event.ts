import { z } from "zod"

// ===========================
// POST /api/events - 行動イベントの受信
// ===========================

/**
 * フロントから送られる 1 件のイベント。
 *
 * `userId` と `source` は **クライアントから受け取らない**。
 * 他人の ID を詐称させないため server 側で解決する。
 */
const eventSchema = z.object({
  name: z.enum(["memo_created", "memo_deleted", "memo_updated", "memo_viewed"]),
  occurredAt: z.string().datetime(),
  properties: z.record(z.union([z.number(), z.string()])).default({}),
})

export const createEventRequestSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
})

export const createEventResponseSchema = z.object({
  accepted: z.number(),
})

export type CreateEventRequest = z.infer<typeof createEventRequestSchema>
export type CreateEventResponse = z.infer<typeof createEventResponseSchema>
