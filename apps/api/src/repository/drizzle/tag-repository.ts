import { asc, contentSourceTags, count, DrizzleClient, eq, inArray, sql, tags } from "@repo/db"
import type { Tag, TagColor } from "@repo/domain"

import type { TagInput, TagRepository, TagSaveResult, TagWithSourceCount } from "../tag-repository"

import { isUniqueViolation } from "./pg-error"
import { convertTagRowToDomain } from "./tag-row"

export class DrizzleTagRepository implements TagRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async create(input: TagInput): Promise<TagSaveResult> {
    try {
      const [row] = await this._db.insert(tags).values({ color: input.color, name: input.name }).returning()
      return { kind: "saved", tag: convertTagRowToDomain(row) }
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: "duplicate" }
      throw error
    }
  }

  public async delete(id: number): Promise<boolean> {
    const rows = await this._db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id })
    return rows.length > 0
  }

  public async findAll(): Promise<TagWithSourceCount[]> {
    const rows = await this._db
      .select({
        id: tags.id,
        color: tags.color,
        name: tags.name,
        sourceCount: count(contentSourceTags.contentSourceId),
        createdAt: tags.createdAt,
        updatedAt: tags.updatedAt,
      })
      .from(tags)
      .leftJoin(contentSourceTags, eq(contentSourceTags.tagId, tags.id))
      .groupBy(tags.id)
      .orderBy(sql`lower(${tags.name})`, asc(tags.id))
    return rows.map(({ sourceCount, ...row }) => ({ ...convertTagRowToDomain(row), sourceCount }))
  }

  public async findByIds(ids: number[]): Promise<Tag[]> {
    if (ids.length === 0) return []
    const rows = await this._db.select().from(tags).where(inArray(tags.id, ids))
    return rows.map((row) => convertTagRowToDomain(row))
  }

  public async findColors(): Promise<TagColor[]> {
    const rows = await this._db.select({ color: tags.color }).from(tags)
    return rows.map((row) => row.color)
  }

  public async update(id: number, input: TagInput): Promise<TagSaveResult | { kind: "not_found" }> {
    try {
      const [row] = await this._db
        .update(tags)
        .set({ color: input.color, name: input.name })
        .where(eq(tags.id, id))
        .returning()
      return row ? { kind: "saved", tag: convertTagRowToDomain(row) } : { kind: "not_found" }
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: "duplicate" }
      throw error
    }
  }
}
