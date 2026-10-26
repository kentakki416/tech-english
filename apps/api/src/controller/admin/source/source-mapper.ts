import type {
  CreateSourceRequest,
  SourceCollectionRunResponse,
  SourceResponse,
  SuggestSourceResponse,
  UpdateSourceRequest,
} from "@repo/api-schema"
import type { SourceCollectionRun } from "@repo/domain"

import type { SourceInput, SourceUpdateInput, SourceWithTags } from "../../../repository"
import type { SourceSuggestion } from "../../../service/source-service"
import { convertTagToResponse } from "../tag/tag-mapper"

/**
 * 登録のリクエスト（snake_case）→ Repository の入力（camelCase）
 */
export const convertCreateSourceRequestToInput = (request: CreateSourceRequest): SourceInput => {
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
 * 編集のリクエスト（snake_case）→ Repository の編集の入力（camelCase）
 */
export const convertUpdateSourceRequestToInput = (request: UpdateSourceRequest): SourceUpdateInput => {
  const base = {
    excludeGlobs: request.exclude_globs,
    includeGlobs: request.include_globs,
    name: request.name,
    tagIds: request.tag_ids,
  }
  if (request.fetch_type === "github_repository") {
    return {
      ...base,
      fetchType: request.fetch_type,
      isEnabled: request.is_enabled,
      publicUrlStripPrefix: request.public_url_strip_prefix,
      publicUrlTemplate: request.public_url_template,
    }
  }
  return {
    ...base,
    contentSelector: request.content_selector,
    excludeSelectors: request.exclude_selectors,
    fetchType: request.fetch_type,
    licenseSpdx: request.license_spdx,
    licenseUrl: request.license_url,
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

/**
 * 収集の実行の記録（domain）→ レスポンス（snake_case）
 */
export const convertSourceCollectionRunToResponse = (run: SourceCollectionRun): SourceCollectionRunResponse => ({
  id: run.id,
  created_passage_count: run.createdPassageCount,
  error: run.error,
  fetched_document_count: run.fetchedDocumentCount,
  finished_at: run.finishedAt?.toISOString() ?? null,
  started_at: run.startedAt?.toISOString() ?? null,
  status: run.status,
  created_at: run.createdAt.toISOString(),
})

/**
 * URL からの登録の初期値（camelCase）→ レスポンス（snake_case）
 */
export const convertSourceSuggestionToResponse = (suggestion: SourceSuggestion): SuggestSourceResponse => {
  if (suggestion.fetchType === "website") {
    return {
      fetch_type: "website",
      include_globs: suggestion.includeGlobs,
      license_spdx: suggestion.licenseSpdx,
      license_url: suggestion.licenseUrl,
      site_url: suggestion.siteUrl,
    }
  }
  return {
    branch: suggestion.branch,
    default_branch: suggestion.defaultBranch,
    detected_license: {
      is_allowed: suggestion.detectedLicense.isAllowed,
      license_spdx: suggestion.detectedLicense.licenseSpdx,
      license_url: suggestion.detectedLicense.licenseUrl,
    },
    fetch_type: "github_repository",
    include_globs: suggestion.includeGlobs,
    repository: suggestion.repository,
  }
}
