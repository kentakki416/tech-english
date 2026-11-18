import type { PassageAttributionResponse } from "@repo/api-schema"

import type { PassageAttribution } from "../../lib/build-attribution"

export const convertAttributionToResponse = (attribution: PassageAttribution): PassageAttributionResponse => ({
  commit_sha: attribution.commitSha,
  license_spdx: attribution.licenseSpdx,
  license_url: attribution.licenseUrl,
  page_url: attribution.pageUrl,
  permalink_url: attribution.permalinkUrl,
  retrieved_at: attribution.retrievedAt.toISOString(),
  source_kind: attribution.sourceKind,
  source_name: attribution.sourceName,
})
