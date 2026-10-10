import { User } from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * ユーザー作成時の入力
 */
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

/**
 * ユーザーリポジトリのインターフェース
 */
export interface UserRepository {
  create(data: CreateUserInput, tx?: TransactionContext): Promise<User>
  findByEmail(email: string): Promise<User | null>
  findById(id: number): Promise<User | null>
  /**
   * 対象が無いときは throw する
   */
  updateProfile(id: number, data: UpdateUserProfileInput): Promise<User>
  /**
   * 対象が無いときは throw する
   */
  updateTimezone(id: number, timezone: string): Promise<User>
}
