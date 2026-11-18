import { AuthAccount, AuthAccountWithUser } from "@repo/domain"

import type { TransactionContext } from "./transaction"

export type CreateAuthAccountInput = {
  provider: string
  providerAccountId: string
  userId: number
}

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
