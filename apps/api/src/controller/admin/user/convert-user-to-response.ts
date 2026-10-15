import type { User } from "@repo/domain"

/**
 * admin のユーザーの基本の項目（一覧と詳細で共有する）→ API の snake_case の形
 */
export const convertAdminUserToResponse = (user: User & { lastStudiedDate: string | null, providers: string[] }) => ({
  id: user.id,
  avatar_url: user.avatarUrl,
  email: user.email,
  last_studied_date: user.lastStudiedDate,
  name: user.name,
  providers: user.providers,
  created_at: user.createdAt.toISOString(),
})
