import type { SourceCollectionRun, Tag } from "@repo/domain"
import type { CollectSourceJobData, JobQueue } from "@repo/queue"

import type {
  SourceCollectionRunRepository,
  SourceCreateInput,
  SourceRepository,
  SourceUpdateInput,
  SourceWithTags,
  TagRepository,
} from "../../../src/repository"

type GitHubRepositoryInput = Extract<SourceCreateInput, { fetchType: "github_repository" }>
type WebsiteInput = Extract<SourceCreateInput, { fetchType: "website" }>
type GitHubRepositoryUpdateInput = Extract<SourceUpdateInput, { fetchType: "github_repository" }>
type WebsiteUpdateInput = Extract<SourceUpdateInput, { fetchType: "website" }>
type GitHubRepositorySourceWithTags = Extract<SourceWithTags, { fetchType: "github_repository" }>
type WebsiteSourceWithTags = Extract<SourceWithTags, { fetchType: "website" }>

/**
 * source-service のユニットテストで共有する Repository のモックと値
 */
export const createMockSourceRepository = () => ({
  countPassagesBySource: vi.fn<SourceRepository["countPassagesBySource"]>(),
  create: vi.fn<SourceRepository["create"]>(),
  findAll: vi.fn<SourceRepository["findAll"]>(),
  findById: vi.fn<SourceRepository["findById"]>(),
  findByRepository: vi.fn<SourceRepository["findByRepository"]>(),
  findBySiteUrl: vi.fn<SourceRepository["findBySiteUrl"]>(),
  update: vi.fn<SourceRepository["update"]>(),
})

export const createMockSourceCollectionRunRepository = () => ({
  create: vi.fn<SourceCollectionRunRepository["create"]>(),
  failTimedOut: vi.fn<SourceCollectionRunRepository["failTimedOut"]>(),
  findLatestBySourceId: vi.fn<SourceCollectionRunRepository["findLatestBySourceId"]>(),
  markQueuedAsFailed: vi.fn<SourceCollectionRunRepository["markQueuedAsFailed"]>(),
})

export const createMockCollectSourceQueue = () => ({
  close: vi.fn<JobQueue<CollectSourceJobData>["close"]>(),
  enqueue: vi.fn<JobQueue<CollectSourceJobData>["enqueue"]>(),
})

export const buildSourceCollectionRun = (overrides: Partial<SourceCollectionRun> = {}): SourceCollectionRun => ({
  id: 10,
  createdPassageCount: null,
  error: null,
  fetchedDocumentCount: null,
  finishedAt: null,
  sourceId: 1,
  startedAt: null,
  status: "queued",
  createdAt: new Date("2026-10-22T03:00:00.000Z"),
  updatedAt: new Date("2026-10-22T03:00:00.000Z"),
  ...overrides,
})

/**
 * ローカル（サイトのソースを受け付ける）と production（受け付けない）の設定
 */
export const LOCAL_POLICY = { isWebsiteSourceAllowed: true }

export const PRODUCTION_POLICY = { isWebsiteSourceAllowed: false }

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
  siteUrl: "https://go.dev",
  tagIds: [],
  ...overrides,
})

/**
 * buildGitHubInput・buildWebsiteInput のうち、編集で変えられる項目
 */
export const buildGitHubUpdateInput = (overrides: Partial<GitHubRepositoryUpdateInput> = {}): GitHubRepositoryUpdateInput => ({
  excludeGlobs: [],
  fetchType: "github_repository",
  includeGlobs: ["src/content/learn/**/*.md"],
  isEnabled: true,
  name: "React 公式ドキュメント",
  publicUrlStripPrefix: "src/content/",
  publicUrlTemplate: "https://react.dev/{path}",
  tagIds: [],
  ...overrides,
})

export const buildWebsiteUpdateInput = (overrides: Partial<WebsiteUpdateInput> = {}): WebsiteUpdateInput => ({
  contentSelector: "main article",
  excludeGlobs: ["/doc/devel/**"],
  excludeSelectors: [".feedback"],
  fetchType: "website",
  includeGlobs: ["/doc/**"],
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://go.dev/copyright",
  name: "Go 公式ドキュメント",
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
    lastCollectedExtractionVersion: null,
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
