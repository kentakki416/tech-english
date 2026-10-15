import type { AdminUserSort, User } from "@repo/domain"

import type { TransactionContext } from "./transaction"

export type CreateUserInput = {
  avatarUrl?: string
  email?: string
  name?: string
  /**
   * 省略すると DB の既定値（Asia/Tokyo）
   */
  timezone?: string
}

/**
 * プロフィール（OAuth プロバイダから取り込む表示名・アイコン）更新時の入力
 */
export type UpdateUserProfileInput = {
  avatarUrl: string | null
  name: string
}

export type AdminUserListItem = User & {
  /**
   * 最後に問題を解いた・単語帳で答えた日（学習したときのユーザーのタイムゾーンの日付）。学習していなければ null
   */
  lastStudiedDate: string | null
  /**
   * ログイン方法（名前順・重複なし）
   */
  providers: string[]
  solvedAttempts: number
}

export type FindUsersForAdminQuery = {
  limit: number
  offset: number
  order: "asc" | "desc"
  /**
   * 名前・メールアドレスの部分一致
   */
  q?: string
  sort: AdminUserSort
}

export interface UserRepository {
  create(data: CreateUserInput, tx?: TransactionContext): Promise<User>
  /**
   * users の行を物理削除する。関連テーブルは DB の ON DELETE CASCADE で消えるので個別に消さない。
   * 対象が無いときは何もしない（同時に 2 回削除されても 2 回目が失敗しないように）
   */
  deleteById(id: number): Promise<void>
  findByEmail(email: string): Promise<User | null>
  findById(id: number): Promise<User | null>
  /**
   * admin のユーザー一覧。解いた回数・最後に学習した日・ログイン方法を結び、絞り込み・並べ替え・ページ分けまでする。total は絞り込んだ全体の件数
   */
  findForAdmin(query: FindUsersForAdminQuery): Promise<{ items: AdminUserListItem[]; total: number }>
  /**
   * 対象が無いときは throw する
   */
  updateProfile(id: number, data: UpdateUserProfileInput): Promise<User>
  /**
   * 対象が無いときは throw する
   */
  updateTimezone(id: number, timezone: string): Promise<User>
}
