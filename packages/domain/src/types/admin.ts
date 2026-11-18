/**
 * 管理画面にサインインできる人。事前に登録した人だけで、User とは関係を持たない
 */
export type Admin = {
  id: number
  avatarUrl: string | null
  /**
   * normalizeEmail でそろえた値
   */
  email: string
  lastSignedInAt: Date | null
  name: string | null
  createdAt: Date
  updatedAt: Date
}
