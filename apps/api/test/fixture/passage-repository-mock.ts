import type { PassageRepository, ReadingAttemptRepository } from "../../src/repository"

/**
 * service のユニットテストで共有する問題・挑戦の Repository のモック（admin-passage-service・passage-service・attempt-service）
 */

export const createMockPassageRepository = () => ({
  clearAttention: vi.fn<PassageRepository["clearAttention"]>(),
  countByStatus: vi.fn<PassageRepository["countByStatus"]>(),
  countPublished: vi.fn<PassageRepository["countPublished"]>(),
  findAdminDetail: vi.fn<PassageRepository["findAdminDetail"]>(),
  findAdminList: vi.fn<PassageRepository["findAdminList"]>(),
  findAttemptContentById: vi.fn<PassageRepository["findAttemptContentById"]>(),
  findPublishedById: vi.fn<PassageRepository["findPublishedById"]>(),
  findPublishedPage: vi.fn<PassageRepository["findPublishedPage"]>(),
  findPublishedTags: vi.fn<PassageRepository["findPublishedTags"]>(),
  findRandomPublishedId: vi.fn<PassageRepository["findRandomPublishedId"]>(),
  resetForRegeneration: vi.fn<PassageRepository["resetForRegeneration"]>(),
  restoreRejected: vi.fn<PassageRepository["restoreRejected"]>(),
  transitionStatus: vi.fn<PassageRepository["transitionStatus"]>(),
  updateDraftContent: vi.fn<PassageRepository["updateDraftContent"]>(),
})

export const createMockReadingAttemptRepository = () => ({
  createInProgress: vi.fn<ReadingAttemptRepository["createInProgress"]>(),
  expireStale: vi.fn<ReadingAttemptRepository["expireStale"]>(),
  findAliveInProgress: vi.fn<ReadingAttemptRepository["findAliveInProgress"]>(),
  findAnswersByAttemptId: vi.fn<ReadingAttemptRepository["findAnswersByAttemptId"]>(),
  findByIdForUser: vi.fn<ReadingAttemptRepository["findByIdForUser"]>(),
  findWordLookupsWithMeaning: vi.fn<ReadingAttemptRepository["findWordLookupsWithMeaning"]>(),
  insertAnswers: vi.fn<ReadingAttemptRepository["insertAnswers"]>(),
  insertWordLookups: vi.fn<ReadingAttemptRepository["insertWordLookups"]>(),
  markSubmitted: vi.fn<ReadingAttemptRepository["markSubmitted"]>(),
  summarizeByPassageIds: vi.fn<ReadingAttemptRepository["summarizeByPassageIds"]>(),
})
