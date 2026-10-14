import { desc, DrizzleClient, eq, memos } from "@repo/db"
import { Memo } from "@repo/domain"

import type { CreateMemoInput, MemoRepository, UpdateMemoInput } from "../memo-repository"

/**
 * Drizzleの型
 */
type MemoRow = typeof memos.$inferSelect

/**
 * Drizzle実装のメモリポジトリ
 */
export class DrizzleMemoRepository implements MemoRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findAll(): Promise<Memo[]> {
    const rows = await this._db.select().from(memos).orderBy(desc(memos.createdAt))
    return rows.map((row) => this._toDomainMemo(row))
  }

  public async findById(id: number): Promise<Memo | null> {
    const [row] = await this._db.select().from(memos).where(eq(memos.id, id))
    if (!row) return null
    return this._toDomainMemo(row)
  }

  public async create(data: CreateMemoInput): Promise<Memo> {
    const [row] = await this._db
      .insert(memos)
      .values({
        body: data.body,
        title: data.title,
      })
      .returning()
    return this._toDomainMemo(row)
  }

  /**
   * 対象が無いときは throw する
   */
  public async update(id: number, data: UpdateMemoInput): Promise<Memo> {
    const [row] = await this._db
      .update(memos)
      .set({
        body: data.body,
        title: data.title,
      })
      .where(eq(memos.id, id))
      .returning()
    if (!row) throw new Error(`Memo not found: id=${id}`)
    return this._toDomainMemo(row)
  }

  /**
   * 対象が無いときは throw する
   */
  public async deleteById(id: number): Promise<void> {
    const [row] = await this._db.delete(memos).where(eq(memos.id, id)).returning({ id: memos.id })
    if (!row) throw new Error(`Memo not found: id=${id}`)
  }

  /**
   * Drizzleの型 → ドメインの型に変換
   */
  private _toDomainMemo(row: MemoRow): Memo {
    return {
      body: row.body,
      createdAt: row.createdAt,
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
    }
  }
}
