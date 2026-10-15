import type { AuthAccountRepository } from "../../../src/repository"
import {
  createMockLearningRecordRepository,
  createMockUserGoalRepository,
  createMockUserRepository,
} from "../learning-record-service/fixtures"
import { createMockVocabularyRepository } from "../vocabulary-service/fixtures"

export { FIXED_NOW, USER } from "../learning-record-service/fixtures"

export const createMockAuthAccountRepository = () => ({
  create: vi.fn<AuthAccountRepository["create"]>(),
  findByProvider: vi.fn<AuthAccountRepository["findByProvider"]>(),
  findProvidersByUserId: vi.fn<AuthAccountRepository["findProvidersByUserId"]>().mockResolvedValue([]),
})

export const createMockAdminUserRepo = () => ({
  authAccountRepository: createMockAuthAccountRepository(),
  learningRecordRepository: createMockLearningRecordRepository(),
  userGoalRepository: createMockUserGoalRepository(),
  userRepository: createMockUserRepository(),
  vocabularyRepository: createMockVocabularyRepository(),
})
