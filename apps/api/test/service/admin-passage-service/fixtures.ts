import type { PassageRepository } from "../../../src/repository"

/**
 * admin-passage-service のユニットテストで共有する Repository のモック
 */
export const createMockPassageRepository = () => ({
  clearAttention: vi.fn<PassageRepository["clearAttention"]>(),
  countByStatus: vi.fn<PassageRepository["countByStatus"]>(),
  findAdminDetail: vi.fn<PassageRepository["findAdminDetail"]>(),
  findAdminList: vi.fn<PassageRepository["findAdminList"]>(),
  resetForRegeneration: vi.fn<PassageRepository["resetForRegeneration"]>(),
  restoreRejected: vi.fn<PassageRepository["restoreRejected"]>(),
  transitionStatus: vi.fn<PassageRepository["transitionStatus"]>(),
  updateDraftContent: vi.fn<PassageRepository["updateDraftContent"]>(),
})

/**
 * 全状態 0 件
 */
export const EMPTY_STATUS_COUNTS = { collected: 0, draft: 0, failed: 0, generating: 0, published: 0, rejected: 0 }
