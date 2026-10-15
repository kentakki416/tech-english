import type { Tag } from "@repo/domain"

import type {
  ContentSourceInput,
  ContentSourceRepository,
  ContentSourceWithTags,
  TagRepository,
} from "../../../src/repository"

type GitHubRepositoryInput = Extract<ContentSourceInput, { fetchType: "github_repository" }>
type WebsiteInput = Extract<ContentSourceInput, { fetchType: "website" }>
type GitHubRepositorySourceWithTags = Extract<ContentSourceWithTags, { fetchType: "github_repository" }>
type WebsiteSourceWithTags = Extract<ContentSourceWithTags, { fetchType: "website" }>

/**
 * content-source-service のユニットテストで共有する Repository のモックと値
 */
export const createMockContentSourceRepository = () => ({
  countFailedPagesBySource: vi.fn<ContentSourceRepository["countFailedPagesBySource"]>(),
  countPassagesBySource: vi.fn<ContentSourceRepository["countPassagesBySource"]>(),
  create: vi.fn<ContentSourceRepository["create"]>(),
  findAll: vi.fn<ContentSourceRepository["findAll"]>(),
  findById: vi.fn<ContentSourceRepository["findById"]>(),
  findByRepository: vi.fn<ContentSourceRepository["findByRepository"]>(),
  findBySiteUrl: vi.fn<ContentSourceRepository["findBySiteUrl"]>(),
  findFailedPages: vi.fn<ContentSourceRepository["findFailedPages"]>(),
  hasSourceDocuments: vi.fn<ContentSourceRepository["hasSourceDocuments"]>(),
  update: vi.fn<ContentSourceRepository["update"]>(),
})

/**
 * service はタグの存在の確認にしか使わないので findByIds だけ
 */
export const createMockTagRepository = () => ({
  findByIds: vi.fn<TagRepository["findByIds"]>(),
})

export const buildTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 1,
  color: "blue",
  name: "react",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
})

export const buildGitHubInput = (overrides: Partial<GitHubRepositoryInput> = {}): GitHubRepositoryInput => ({
  branch: "main",
  excludeGlobs: [],
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
  tagIds: [],
  ...overrides,
})

export const buildWebsiteInput = (overrides: Partial<WebsiteInput> = {}): WebsiteInput => ({
  contentSelector: "main article",
  excludeGlobs: ["/doc/devel/**"],
  excludeSelectors: [".feedback"],
  fetchType: "website",
  includeGlobs: ["/doc/**"],
  isEnabled: false,
  kind: "docs",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://go.dev/copyright",
  name: "Go 公式ドキュメント",
  sitemapUrl: "https://go.dev/sitemap.xml",
  siteUrl: "https://go.dev",
  startUrl: null,
  tagIds: [],
  ...overrides,
})

/**
 * 入力の値を持つソース。tagIds はソースの列ではないので外し、タグは空にする（overrides の tags で付ける）
 */
export const buildGitHubSource = (overrides: Partial<GitHubRepositorySourceWithTags> = {}): GitHubRepositorySourceWithTags => {
  const { tagIds, ...input } = buildGitHubInput()
  return {
    id: 1,
    ...input,
    lastCollectedAt: new Date("2026-10-09T03:00:00.000Z"),
    lastCollectedCommitSha: "abc123",
    tags: [],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  }
}

export const buildWebsiteSource = (overrides: Partial<WebsiteSourceWithTags> = {}): WebsiteSourceWithTags => {
  const { tagIds, ...input } = buildWebsiteInput()
  return {
    id: 2,
    ...input,
    lastCollectedAt: null,
    tags: [],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  }
}
