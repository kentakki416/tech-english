import { passages, sourceDocuments, sources } from "@repo/db"
import type { PassageStatus } from "@repo/domain"

import { testDb } from "../../setup"

type SourceInsert = typeof sources.$inferInsert

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
  repository: "reactjs/react.dev",
  tag_ids: [],
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
  site_url: "https://go.dev",
  tag_ids: [],
}

/**
 * 編集（PUT）のリクエスト。登録のリクエストから、編集で変えられない項目（取得元・種別・GitHub のライセンス）を除いたもの
 */
export const GITHUB_UPDATE_REQUEST = {
  exclude_globs: ["src/content/blog/**"],
  fetch_type: "github_repository",
  include_globs: ["src/content/learn/**/*.md"],
  is_enabled: true,
  name: "React 公式ドキュメント",
  tag_ids: [],
}

export const WEBSITE_UPDATE_REQUEST = {
  content_selector: "main article",
  exclude_globs: ["/doc/devel/**"],
  exclude_selectors: [".feedback"],
  fetch_type: "website",
  include_globs: ["/doc/**"],
  license_spdx: "CC-BY-4.0",
  license_url: "https://go.dev/copyright",
  name: "Go 公式ドキュメント",
  tag_ids: [],
}

/**
 * リクエストのうちレスポンスにそのまま返る項目（tag_ids はレスポンスでは tags になるので外す）
 */
export const omitTagIds = <Body extends { tag_ids: number[] }>({ tag_ids: tagIds, ...fields }: Body) => fields

export const insertGitHubSource = async (overrides: Partial<SourceInsert> = {}) => {
  const [row] = await testDb
    .insert(sources)
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
      ...overrides,
    })
    .returning()
  return row
}

export const insertWebsiteSource = async (overrides: Partial<SourceInsert> = {}) => {
  const [row] = await testDb
    .insert(sources)
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
      siteUrl: "https://go.dev",
      ...overrides,
    })
    .returning()
  return row
}

export const insertSourceDocument = async (sourceId: number, path: string) => {
  const [row] = await testDb.insert(sourceDocuments).values({ path, sourceId }).returning()
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
