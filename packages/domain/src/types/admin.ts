/**
 * 管理画面にサインインできる人（事前登録制。users とは関係を持たない）
 */
export type Admin = {
  id: number
  avatarUrl: string | null
  /**
   * 小文字で前後に空白の無い email（normalizeEmail にかけた値）
   */
  email: string
  lastSignedInAt: Date | null
  name: string | null
  createdAt: Date
  updatedAt: Date
}
