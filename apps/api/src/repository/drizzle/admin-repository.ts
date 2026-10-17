import { admins, DrizzleClient, eq } from "@repo/db"
import { Admin } from "@repo/domain"

import type { AdminRepository, RecordAdminSignInInput } from "../admin-repository"

/**
 * Drizzleの型
 */
type AdminRow = typeof admins.$inferSelect

/**
 * Drizzle実装の admin リポジトリ
 */
export class DrizzleAdminRepository implements AdminRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findByEmail(email: string): Promise<Admin | null> {
    const [row] = await this._db.select().from(admins).where(eq(admins.email, email))
    if (!row) return null
    return this._toDomainAdmin(row)
  }

  public async findById(id: number): Promise<Admin | null> {
    const [row] = await this._db.select().from(admins).where(eq(admins.id, id))
    if (!row) return null
    return this._toDomainAdmin(row)
  }

  public async recordSignIn(id: number, data: RecordAdminSignInInput): Promise<Admin> {
    const [row] = await this._db
      .update(admins)
      .set({
        ...(data.profile ? { avatarUrl: data.profile.avatarUrl, name: data.profile.name } : {}),
        lastSignedInAt: data.signedInAt,
      })
      .where(eq(admins.id, id))
      .returning()
    if (!row) throw new Error(`Admin not found: id=${id}`)
    return this._toDomainAdmin(row)
  }

  /**
   * Drizzleの型 → ドメインの型に変換
   */
  private _toDomainAdmin(row: AdminRow): Admin {
    return {
      id: row.id,
      avatarUrl: row.avatarUrl,
      email: row.email,
      lastSignedInAt: row.lastSignedInAt,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
