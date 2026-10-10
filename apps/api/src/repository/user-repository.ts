import { User } from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * ユーザー作成時の入力
 */
export type CreateUserInput = {
  avatarUrl?: string
  email?: string
  name?: string
}

/**
 * ユーザーリポジトリのインターフェース
 */
export interface UserRepository {
  create(data: CreateUserInput, tx?: TransactionContext): Promise<User>
  findByEmail(email: string): Promise<User | null>
  findById(id: number): Promise<User | null>
}
