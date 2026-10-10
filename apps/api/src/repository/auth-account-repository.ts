import { AuthAccount, AuthAccountWithUser } from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * 認証アカウント作成時の入力
 *
 * provider は "google" | "github" | "credentials" などの文字列を受ける（schema 側は String 型）。
 * OAuth トークン系は本アプリでは保持しないため input に含めない。
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
}
