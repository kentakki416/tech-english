import { AuthAccount, AuthAccountWithUser } from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * 認証アカウント作成時の入力
 */
export type CreateAuthAccountInput = {
  provider: string
  providerAccountId: string
  userId: number
}

/**
 * 認証アカウントリポジトリのインターフェース
 */
export interface AuthAccountRepository {
  create(data: CreateAuthAccountInput, tx?: TransactionContext): Promise<AuthAccount>
  findByProvider(
    provider: string,
    providerAccountId: string
  ): Promise<AuthAccountWithUser | null>
  /**
   * そのユーザーのログイン方法（provider）。名前順・重複なし。無ければ空の配列
   */
  findProvidersByUserId(userId: number): Promise<string[]>
}
