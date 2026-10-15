import { DrizzleClient, eq, type SQL, sql, users } from "@repo/db"
import type { AdminUserSort, User } from "@repo/domain"

import type { TransactionContext } from "../transaction"
import type {
  AdminUserListItem,
  CreateUserInput,
  FindUsersForAdminQuery,
  UpdateUserProfileInput,
  UserRepository,
} from "../user-repository"

import { buildContainsLikePattern } from "./like-pattern"
import { resolveDrizzleClient } from "./transaction-runner"

/**
 * Drizzleの型
 */
type UserRow = typeof users.$inferSelect

type AdminUserListRow = {
  id: number
  avatar_url: string | null
  created_at: string
  email: string | null
  last_studied_date: string | null
  name: string | null
  providers: string[]
  solved_attempts: string
  timezone: string
  total: string
  updated_at: string
}

/**
 * admin のユーザー一覧の並べ替えの式（a は提出の集計、u は users）
 */
const ADMIN_USER_SORT_EXPRESSIONS: Record<AdminUserSort, SQL> = {
  created_at: sql`u.created_at`,
  last_studied_date: sql`last_studied_date`,
  solved_attempts: sql`solved_attempts`,
}

/**
 * timestamp without time zone（UTC）の文字列を Date にする
 */
const parseUtcTimestamp = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)

/**
 * Drizzle実装のユーザーリポジトリ
 */
export class DrizzleUserRepository implements UserRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findById(id: number): Promise<User | null> {
    const [row] = await this._db.select().from(users).where(eq(users.id, id))
    if (!row) return null
    return this._toDomainUser(row)
  }

  /**
   * users に、提出の数と最後の study_date・単語帳の最後の study_date・ログイン方法を、それぞれユーザーごとに束ねて left join する
   * （admin-users step1）。範囲外のページ（行が 0 件）では count(*) OVER () が取れないので、件数だけ数え直す
   */
  public async findForAdmin(query: FindUsersForAdminQuery): Promise<{ items: AdminUserListItem[]; total: number }> {
    const condition = query.q === undefined
      ? sql`TRUE`
      : sql`(u.name ILIKE ${buildContainsLikePattern(query.q)} ESCAPE '\\' OR u.email ILIKE ${buildContainsLikePattern(query.q)} ESCAPE '\\')`
    const select = sql`
      SELECT u.id, u.avatar_url, u.email, u.name, u.timezone,
             u.created_at::text AS created_at, u.updated_at::text AS updated_at,
             coalesce(a.solved_attempts, 0) AS solved_attempts,
             GREATEST(a.last_date, v.last_date)::text AS last_studied_date,
             coalesce(p.providers, '{}') AS providers,
             count(*) OVER () AS total
        FROM users u
        LEFT JOIN (
          SELECT user_id, count(*) AS solved_attempts, max(study_date) AS last_date
            FROM reading_attempts WHERE status = 'submitted' GROUP BY user_id
        ) a ON a.user_id = u.id
        LEFT JOIN (SELECT user_id, max(study_date) AS last_date FROM vocabulary_reviews GROUP BY user_id) v ON v.user_id = u.id
        LEFT JOIN (
          SELECT user_id, array_agg(DISTINCT provider ORDER BY provider) AS providers FROM auth_accounts GROUP BY user_id
        ) p ON p.user_id = u.id
       WHERE ${condition}
    `
    const direction = query.order === "asc" ? sql`ASC` : sql`DESC`
    const result = await this._db.execute<AdminUserListRow>(sql`
      ${select}
       ORDER BY ${ADMIN_USER_SORT_EXPRESSIONS[query.sort]} ${direction} NULLS LAST, u.id
       LIMIT ${query.limit} OFFSET ${query.offset}
    `)
    if (result.rows.length > 0) {
      return { items: result.rows.map((row) => this._toAdminUserListItem(row)), total: Number(result.rows[0].total) }
    }
    const counted = await this._db.execute<{ total: string }>(sql`SELECT count(*) AS total FROM (${select}) counted`)
    return { items: [], total: Number(counted.rows[0]?.total ?? 0) }
  }

  public async findByEmail(email: string): Promise<User | null> {
    const [row] = await this._db.select().from(users).where(eq(users.email, email))
    if (!row) return null
    return this._toDomainUser(row)
  }

  public async create(data: CreateUserInput, tx?: TransactionContext): Promise<User> {
    const client = resolveDrizzleClient(this._db, tx)
    const [row] = await client
      .insert(users)
      .values({
        avatarUrl: data.avatarUrl,
        email: data.email,
        name: data.name,
        timezone: data.timezone,
      })
      .returning()
    return this._toDomainUser(row)
  }

  /**
   * 対象が無いときは throw する
   */
  public async updateProfile(id: number, data: UpdateUserProfileInput): Promise<User> {
    const [row] = await this._db
      .update(users)
      .set({
        avatarUrl: data.avatarUrl,
        name: data.name,
      })
      .where(eq(users.id, id))
      .returning()
    if (!row) throw new Error(`User not found: id=${id}`)
    return this._toDomainUser(row)
  }

  /**
   * 対象が無いときは throw する
   */
  public async updateTimezone(id: number, timezone: string): Promise<User> {
    const [row] = await this._db
      .update(users)
      .set({ timezone })
      .where(eq(users.id, id))
      .returning()
    if (!row) throw new Error(`User not found: id=${id}`)
    return this._toDomainUser(row)
  }

  /**
   * 関連テーブル（auth_accounts など）は DB の ON DELETE CASCADE で消える。
   * 対象が無いときは何もしない（interface の契約）
   */
  public async deleteById(id: number): Promise<void> {
    await this._db.delete(users).where(eq(users.id, id))
  }

  private _toAdminUserListItem(row: AdminUserListRow): AdminUserListItem {
    return {
      avatarUrl: row.avatar_url,
      createdAt: parseUtcTimestamp(row.created_at),
      email: row.email,
      id: row.id,
      lastStudiedDate: row.last_studied_date,
      name: row.name,
      providers: row.providers,
      solvedAttempts: Number(row.solved_attempts),
      timezone: row.timezone,
      updatedAt: parseUtcTimestamp(row.updated_at),
    }
  }

  /**
   * Drizzleの型 → ドメインの型に変換
   */
  private _toDomainUser(row: UserRow): User {
    return {
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
      email: row.email,
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      updatedAt: row.updatedAt,
    }
  }
}
