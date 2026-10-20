import type { IPageFetcher } from "../../../src/client/page-fetcher"
import type { ImportPassage, UrlImportPageCacheRepository, UrlImportRepository } from "../../../src/repository"

/**
 * url-import-service のユニットテストで共有する Repository・クライアントのモックと値
 */
export const createMockUrlImportRepository = () => ({
  findDocumentPassages: vi.fn<UrlImportRepository["findDocumentPassages"]>(),
  findPassagesByContentHashes: vi.fn<UrlImportRepository["findPassagesByContentHashes"]>(),
  insertCandidates: vi.fn<UrlImportRepository["insertCandidates"]>(),
  prioritizeCollected: vi.fn<UrlImportRepository["prioritizeCollected"]>(),
  rejectCollected: vi.fn<UrlImportRepository["rejectCollected"]>(),
  upsertFetchedDocument: vi.fn<UrlImportRepository["upsertFetchedDocument"]>(),
})

/**
 * 既定はキャッシュに無い（find は null）
 */
export const createMockUrlImportPageCacheRepository = () => ({
  find: vi.fn<UrlImportPageCacheRepository["find"]>().mockResolvedValue(null),
  save: vi.fn<UrlImportPageCacheRepository["save"]>().mockResolvedValue(),
})

export const createMockPageFetcher = () => ({
  fetchAndExtractPage: vi.fn<IPageFetcher["fetchAndExtractPage"]>(),
})

export const buildImportPassage = (overrides: Partial<ImportPassage> = {}): ImportPassage => ({
  id: 10,
  contentHash: "hash-getting-started",
  generatedAt: null,
  status: "collected",
  title: "Getting started",
  ...overrides,
})
