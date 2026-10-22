import { createHash } from "node:crypto"

import { z } from "zod"

import { CHUNK_REJECT_REASONS, PASSAGE_BLOCK_TYPES } from "@repo/domain"
import type { Redis } from "@repo/redis"

import type { FetchedPage } from "../../client/page-fetcher"
import type { UrlImportPageCacheKey, UrlImportPageCacheRepository } from "../url-import-page-cache-repository"

const KEY_PREFIX = "url_import_page"

/**
 * 確認から保存までの間に置いておく時間。過ぎたら保存のときにページを取り直す
 */
const TTL_SECONDS = 600

const fetchedPageSchema = z.object({
  chunks: z.array(z.object({
    blocks: z.array(z.object({
      lang: z.string().optional(),
      text: z.string(),
      translationJa: z.string().optional(),
      type: z.enum(PASSAGE_BLOCK_TYPES),
    }).strict()),
    contentHash: z.string(),
    rejectReasons: z.array(z.enum(CHUNK_REJECT_REASONS)),
    title: z.string(),
    wordCount: z.number(),
  }).strict()),
  contentHash: z.string(),
  extractionVersion: z.string(),
  normalizedUrl: z.string(),
  path: z.string(),
  title: z.string(),
  wordCount: z.number(),
}).strict()

/**
 * ioredis 実装。キーは `url_import_page:{sourceId}:{sourceUpdatedAt のミリ秒}:{url の SHA-256}`（URL は最大 2048 文字あるので、キーを短くするためにハッシュにする）。
 * 値の形は strict で確かめる（FetchedPage に項目が増えたとき、古い形の値を使って項目が欠けたまま保存しないため）
 */
export class IoRedisUrlImportPageCacheRepository implements UrlImportPageCacheRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  public async find(key: UrlImportPageCacheKey): Promise<FetchedPage | null> {
    const raw = await this._redis.get(this._keyOf(key))
    if (raw === null) return null
    try {
      const parsed = fetchedPageSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  public async save(key: UrlImportPageCacheKey, page: FetchedPage): Promise<void> {
    await this._redis.set(this._keyOf(key), JSON.stringify(page), "EX", TTL_SECONDS)
  }

  private _keyOf(key: UrlImportPageCacheKey): string {
    const urlHash = createHash("sha256").update(key.url).digest("hex")
    return `${KEY_PREFIX}:${key.sourceId}:${key.sourceUpdatedAt.getTime()}:${urlHash}`
  }
}
