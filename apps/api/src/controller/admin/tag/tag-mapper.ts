import type { GetTagListResponse, TagResponse } from "@repo/api-schema"
import type { Tag } from "@repo/domain"

import type { TagWithSourceCount } from "../../../repository"

/**
 * ドメインの Tag → レスポンス
 */
export const convertTagToResponse = (tag: Tag): TagResponse => ({
  id: tag.id,
  color: tag.color,
  name: tag.name,
})

/**
 * 一覧の 1 行 → レスポンス
 */
export const convertTagWithSourceCountToResponse = (
  tag: TagWithSourceCount,
): GetTagListResponse["tags"][number] => ({
  ...convertTagToResponse(tag),
  source_count: tag.sourceCount,
})
