/**
 * ユーザードメイン型
 */
export type User = {
  avatarUrl: string | null
  createdAt: Date
  email: string | null
  id: number
  name: string | null
  /**
   * IANA タイムゾーン名（例: Asia/Tokyo）
   */
  timezone: string
  updatedAt: Date
}
