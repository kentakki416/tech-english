import type { GetTagListResponse, TagResponse } from "@repo/api-schema"
import type { Tag } from "@repo/domain"

import type { TagWithSourceCount } from "../../../repository"

export const convertTagToResponse = (tag: Tag): TagResponse => ({
  id: tag.id,
  color: tag.color,
  name: tag.name,
})

export const convertTagWithSourceCountToResponse = (
  tag: TagWithSourceCount,
): GetTagListResponse["tags"][number] => ({
  ...convertTagToResponse(tag),
  source_count: tag.sourceCount,
})
