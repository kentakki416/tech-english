import { z } from "zod"

// ========================================================
// GET /api/admin/me - サインイン中の admin
// ========================================================

/**
 * サインイン中の admin のレスポンススキーマ
 */
export const getAdminMeResponseSchema = z.object({
  id: z.number(),
  avatar_url: z.string().nullable(),
  email: z.string(),
  last_signed_in_at: z.string().nullable(),
  name: z.string().nullable(),
  created_at: z.string(),
})

export type GetAdminMeResponse = z.infer<typeof getAdminMeResponseSchema>
