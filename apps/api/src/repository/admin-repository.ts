import { Admin } from "@repo/domain"

/**
 * profile を省くと、name と avatarUrl は今の値のままにする
 */
export type RecordAdminSignInInput = {
  profile?: { avatarUrl: string | null; name: string }
  signedInAt: Date
}

export interface AdminRepository {
  findByEmail(email: string): Promise<Admin | null>
  findById(id: number): Promise<Admin | null>
  recordSignIn(id: number, data: RecordAdminSignInInput): Promise<Admin>
}
