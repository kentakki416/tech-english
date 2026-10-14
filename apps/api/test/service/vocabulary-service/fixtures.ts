import type { User } from "@repo/domain"

import type { UserRepository, VocabularyEncounter, VocabularyRepository } from "../../../src/repository"
import { PASSAGE_BLOCKS } from "../../fixture/passage-content"

/**
 * vocabulary-service のユニットテストで共有する値とモック
 */

/**
 * Asia/Tokyo では 2026-10-15、UTC では 2026-10-14
 */
export const FIXED_NOW = new Date("2026-10-14T15:30:00.000Z")

export const USER: User = {
  id: 7,
  avatarUrl: null,
  email: "learner@example.com",
  name: "Learner",
  timezone: "Asia/Tokyo",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
}

export const createMockUserRepository = () => ({
  create: vi.fn<UserRepository["create"]>(),
  deleteById: vi.fn<UserRepository["deleteById"]>(),
  findByEmail: vi.fn<UserRepository["findByEmail"]>(),
  findById: vi.fn<UserRepository["findById"]>().mockResolvedValue(USER),
  updateProfile: vi.fn<UserRepository["updateProfile"]>(),
  updateTimezone: vi.fn<UserRepository["updateTimezone"]>(),
})

/**
 * 既定は候補もカードも無い
 */
export const createMockVocabularyRepository = () => ({
  findDueCards: vi.fn<VocabularyRepository["findDueCards"]>().mockResolvedValue([]),
  findNewEncounters: vi.fn<VocabularyRepository["findNewEncounters"]>().mockResolvedValue([]),
  summarize: vi.fn<VocabularyRepository["summarize"]>().mockResolvedValue({
    dueCount: 0,
    learningCount: 0,
    masteredCount: 0,
    newCount: 0,
    nextDueDate: null,
  }),
})

/**
 * 辞書の意味だけを持つ出会った場所（本文の 1 文は「logic」で見つかる）
 */
export const buildEncounter = (lemma: string, overrides: Partial<VocabularyEncounter> = {}): VocabularyEncounter => ({
  dictionaryMeaningJa: `${lemma} の意味`,
  glossary: null,
  lemma,
  passage: { blocks: PASSAGE_BLOCKS, id: 5, title: "Synchronizing with Effects" },
  surface: lemma,
  ...overrides,
})
