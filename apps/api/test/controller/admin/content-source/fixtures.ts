import { contentSources, passages, sourceDocuments } from "@repo/db"
import type { PassageStatus } from "@repo/domain"

import { testDb } from "../../setup"

type ContentSourceInsert = typeof contentSources.$inferInsert

/**
 * admin のソース API のインテグレーションテストで共有するリクエストと DB への投入
 */
export const GITHUB_REQUEST = {
  branch: "main",
  exclude_globs: ["src/content/blog/**"],
  fetch_type: "github_repository",
  include_globs: ["src/content/learn/**/*.md"],
  is_enabled: true,
  kind: "docs",
  license_spdx: "CC-BY-4.0",
  license_url: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  name: "React 公式ドキュメント",
  public_url_strip_prefix: "src/content/",
  public_url_template: "https://react.dev/{path}",
  repository: "reactjs/react.dev",
  tags: ["react"],
}

export const WEBSITE_REQUEST = {
  content_selector: "main article",
  exclude_globs: ["/doc/devel/**"],
  exclude_selectors: [".feedback"],
  fetch_type: "website",
  include_globs: ["/doc/**"],
  kind: "docs",
  license_spdx: "CC-BY-4.0",
  license_url: "https://go.dev/copyright",
  name: "Go 公式ドキュメント",
  sitemap_url: "https://go.dev/sitemap.xml",
  site_url: "https://go.dev",
  start_url: null,
  tags: ["go"],
}

export const insertGitHubSource = async (overrides: Partial<ContentSourceInsert> = {}) => {
  const [row] = await testDb
    .insert(contentSources)
    .values({
      branch: "main",
      excludeGlobs: ["src/content/blog/**"],
      fetchType: "github_repository",
      includeGlobs: ["src/content/learn/**/*.md"],
      isEnabled: true,
      kind: "docs",
      licenseSpdx: "CC-BY-4.0",
      licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
      name: "React 公式ドキュメント",
      publicUrlStripPrefix: "src/content/",
      publicUrlTemplate: "https://react.dev/{path}",
      repository: "reactjs/react.dev",
      tags: ["react"],
      ...overrides,
    })
    .returning()
  return row
}

export const insertWebsiteSource = async (overrides: Partial<ContentSourceInsert> = {}) => {
  const [row] = await testDb
    .insert(contentSources)
    .values({
      contentSelector: "main article",
      excludeGlobs: ["/doc/devel/**"],
      excludeSelectors: [".feedback"],
      fetchType: "website",
      includeGlobs: ["/doc/**"],
      kind: "docs",
      licenseSpdx: "CC-BY-4.0",
      licenseUrl: "https://go.dev/copyright",
      name: "Go 公式ドキュメント",
      sitemapUrl: "https://go.dev/sitemap.xml",
      siteUrl: "https://go.dev",
      tags: ["go"],
      ...overrides,
    })
    .returning()
  return row
}

export const insertSourceDocument = async (sourceId: number, path: string, httpStatus: number | null = null) => {
  const [row] = await testDb.insert(sourceDocuments).values({ httpStatus, path, sourceId }).returning()
  return row
}

let passageSequence = 0

/**
 * passages を必須列と状態だけで入れる（content_hash は unique なので連番にする）
 */
export const insertPassages = async (sourceDocumentId: number, status: PassageStatus, times: number) => {
  for (let index = 0; index < times; index++) {
    passageSequence++
    await testDb.insert(passages).values({
      blocks: [{ text: "Body", type: "paragraph" }],
      contentHash: `controller-hash-${passageSequence}`,
      sourceDocumentId,
      sourcePath: "docs/index.md",
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      status,
      title: "Title",
      wordCount: 300,
    })
  }
}
