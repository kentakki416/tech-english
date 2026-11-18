import { User } from "./user"

/**
 * (provider, providerAccountId) で一意。
 *
 * OAuth プロバイダの access_token / refresh_token は持たない
 * （プロバイダから取得した user info を保存した後は、内部の JWT だけで完結する）。
 */
export type AuthAccount = {
  createdAt: Date
  id: number
  /**
   * "google" | "github" | "dev"
   */
  provider: string
  providerAccountId: string
  updatedAt: Date
  userId: number
}

export type AuthAccountWithUser = AuthAccount & {
  user: User
}
