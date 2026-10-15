import type { ContentSourceResponse, CreateContentSourceRequest, UpdateContentSourceRequest } from "@repo/api-schema"

import type { ContentSourceInput, ContentSourceWithTags } from "../../../repository"
import { convertTagToResponse } from "../tag/tag-mapper"

export const convertContentSourceRequestToInput = (
  request: CreateContentSourceRequest | UpdateContentSourceRequest,
): ContentSourceInput => {
  const base = {
    excludeGlobs: request.exclude_globs,
    includeGlobs: request.include_globs,
    kind: request.kind,
    licenseSpdx: request.license_spdx,
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
    /**
     * 登録の website は is_enabled を受け取らない（service でも必ず無効で作る）
     */
    isEnabled: "is_enabled" in request ? request.is_enabled : false,
    sitemapUrl: request.sitemap_url,
    siteUrl: request.site_url,
    startUrl: request.start_url,
  }
}

/**
 * タグつきのソース → レスポンス（snake_case、日時は ISO 8601）
 */
export const convertContentSourceToResponse = (source: ContentSourceWithTags): ContentSourceResponse => {
  const base = {
    id: source.id,
    exclude_globs: source.excludeGlobs,
    include_globs: source.includeGlobs,
    is_enabled: source.isEnabled,
    kind: source.kind,
    last_collected_at: source.lastCollectedAt?.toISOString() ?? null,
    license_spdx: source.licenseSpdx,
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
    sitemap_url: source.sitemapUrl,
    site_url: source.siteUrl,
    start_url: source.startUrl,
  }
}
