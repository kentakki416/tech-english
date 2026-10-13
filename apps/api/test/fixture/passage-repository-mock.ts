import type { PassageRepository, ReadingAttemptRepository } from "../../src/repository"

/**
 * service のユニットテストで共有する問題・挑戦の Repository のモック（admin-passage-service と passage-service）
 */

export const createMockPassageRepository = () => ({
  countByStatus: vi.fn<PassageRepository["countByStatus"]>(),
  countPublished: vi.fn<PassageRepository["countPublished"]>(),
  findAdminDetail: vi.fn<PassageRepository["findAdminDetail"]>(),
  findAdminList: vi.fn<PassageRepository["findAdminList"]>(),
  findPublishedById: vi.fn<PassageRepository["findPublishedById"]>(),
  findPublishedPage: vi.fn<PassageRepository["findPublishedPage"]>(),
  findPublishedTags: vi.fn<PassageRepository["findPublishedTags"]>(),
  findRandomPublishedId: vi.fn<PassageRepository["findRandomPublishedId"]>(),
  resetForRegeneration: vi.fn<PassageRepository["resetForRegeneration"]>(),
  transitionStatus: vi.fn<PassageRepository["transitionStatus"]>(),
  updateDraftContent: vi.fn<PassageRepository["updateDraftContent"]>(),
})

export const createMockReadingAttemptRepository = () => ({
  findAliveInProgress: vi.fn<ReadingAttemptRepository["findAliveInProgress"]>(),
  summarizeByPassageIds: vi.fn<ReadingAttemptRepository["summarizeByPassageIds"]>(),
})
