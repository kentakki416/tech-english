import type { GitHubRepositorySource, WebsiteSource } from "@repo/domain"

import type { ContentSourceInput, ContentSourceRepository } from "../../../src/repository"

type GitHubRepositoryInput = Extract<ContentSourceInput, { fetchType: "github_repository" }>
type WebsiteInput = Extract<ContentSourceInput, { fetchType: "website" }>

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
  tags: ["react"],
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
  tags: ["go"],
  ...overrides,
})

export const buildGitHubSource = (overrides: Partial<GitHubRepositorySource> = {}): GitHubRepositorySource => ({
  id: 1,
  ...buildGitHubInput(),
  lastCollectedAt: new Date("2026-10-09T03:00:00.000Z"),
  lastCollectedCommitSha: "abc123",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
})

export const buildWebsiteSource = (overrides: Partial<WebsiteSource> = {}): WebsiteSource => ({
  id: 2,
  ...buildWebsiteInput(),
  lastCollectedAt: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
})
