import { Admin } from "@repo/domain"

/**
 * サインインしたときに更新する値
 * profile は Google から取った名前とアイコン。dev ログインでは渡さず、今の値のままにする
 */
export type RecordAdminSignInInput = {
  profile?: { avatarUrl: string | null; name: string }
  signedInAt: Date
}

/**
 * admin リポジトリのインターフェース
 */
export interface AdminRepository {
  findByEmail(email: string): Promise<Admin | null>
  findById(id: number): Promise<Admin | null>
  recordSignIn(id: number, data: RecordAdminSignInInput): Promise<Admin>
}
