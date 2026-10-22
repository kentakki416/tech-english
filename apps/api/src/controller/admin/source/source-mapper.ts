import type { CreateSourceRequest, SourceResponse, UpdateSourceRequest } from "@repo/api-schema"

import type { SourceInput, SourceWithTags } from "../../../repository"
import { convertTagToResponse } from "../tag/tag-mapper"

/**
 * 登録・更新のリクエスト（snake_case）→ Repository の入力（camelCase）
 */
export const convertSourceRequestToInput = (
  request: CreateSourceRequest | UpdateSourceRequest,
): SourceInput => {
  const base = {
    excludeGlobs: request.exclude_globs,
    includeGlobs: request.include_globs,
    kind: request.kind,
    licenseUrl: request.license_url,
    name: request.name,
    tagIds: request.tag_ids,
  }
  if (request.fetch_type === "github_repository") {
    return {
      ...base,
      branch: request.branch,
      fetchType: request.fetch_type,
      isEnabled: request.is_enabled,
      licenseSpdx: request.license_spdx,
      publicUrlStripPrefix: request.public_url_strip_prefix,
      publicUrlTemplate: request.public_url_template,
      repository: request.repository,
    }
  }
  return {
    ...base,
    contentSelector: request.content_selector,
    excludeSelectors: request.exclude_selectors,
    fetchType: request.fetch_type,
    isEnabled: false,
    licenseSpdx: request.license_spdx,
    siteUrl: request.site_url,
  }
}

/**
 * タグつきのソース → レスポンス（snake_case、日時は ISO 8601）
 */
export const convertSourceToResponse = (source: SourceWithTags): SourceResponse => {
  const base = {
    id: source.id,
    exclude_globs: source.excludeGlobs,
    include_globs: source.includeGlobs,
    is_enabled: source.isEnabled,
    kind: source.kind,
    last_collected_at: source.lastCollectedAt?.toISOString() ?? null,
    license_url: source.licenseUrl,
    name: source.name,
    tags: source.tags.map(convertTagToResponse),
    created_at: source.createdAt.toISOString(),
    updated_at: source.updatedAt.toISOString(),
  }
  if (source.fetchType === "github_repository") {
    return {
      ...base,
      branch: source.branch,
      fetch_type: source.fetchType,
      last_collected_commit_sha: source.lastCollectedCommitSha,
      license_spdx: source.licenseSpdx,
      public_url_strip_prefix: source.publicUrlStripPrefix,
      public_url_template: source.publicUrlTemplate,
      repository: source.repository,
    }
  }
  return {
    ...base,
    content_selector: source.contentSelector,
    exclude_selectors: source.excludeSelectors,
    fetch_type: source.fetchType,
    license_spdx: source.licenseSpdx,
    site_url: source.siteUrl,
  }
}
