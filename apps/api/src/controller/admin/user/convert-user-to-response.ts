import type { User } from "@repo/domain"

export const convertAdminUserToResponse = (user: User & { lastStudiedDate: string | null, providers: string[] }) => ({
  id: user.id,
  avatar_url: user.avatarUrl,
  email: user.email,
  last_studied_date: user.lastStudiedDate,
  name: user.name,
  providers: user.providers,
  created_at: user.createdAt.toISOString(),
})
