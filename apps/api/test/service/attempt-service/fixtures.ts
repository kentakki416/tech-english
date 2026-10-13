import type { Passage, ReadingAttempt, User } from "@repo/domain"

import type { AttemptContent, UserRepository } from "../../../src/repository"
import { buildGlossaryEntries, buildPassage, buildQuestions } from "../../fixture/passage-content"

/**
 * attempt-service のユニットテストで共有する値。問題・挑戦の Repository のモックは test/fixture/passage-repository-mock.ts を使う
 */

export const FIXED_NOW = new Date("2026-10-13T00:00:00.000Z")

/**
 * FIXED_NOW の 24 時間前（これより後に開始した in_progress だけが期限内）
 */
export const ALIVE_SINCE = new Date("2026-10-12T00:00:00.000Z")

export const USER: User = {
  id: 7,
  avatarUrl: null,
  email: "attempt@example.com",
  name: "Attempt User",
  timezone: "Asia/Tokyo",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
}

export const createMockUserRepository = () => ({
  create: vi.fn<UserRepository["create"]>(),
  deleteById: vi.fn<UserRepository["deleteById"]>(),
  findByEmail: vi.fn<UserRepository["findByEmail"]>(),
  findById: vi.fn<UserRepository["findById"]>(),
  updateProfile: vi.fn<UserRepository["updateProfile"]>(),
  updateTimezone: vi.fn<UserRepository["updateTimezone"]>(),
})

/**
 * 公開中の問題の内容（test/fixture/passage-content.ts の本文・用語集 101〜103・設問 201〜203。設問 203 は用語集 102 の語義設問）
 */
export const buildAttemptContent = (overrides: Partial<Passage> = {}): AttemptContent => {
  const glossary = buildGlossaryEntries()
  return {
    glossary,
    passage: buildPassage({
      publishedAt: new Date("2026-10-12T03:00:00.000Z"),
      reviewedAt: new Date("2026-10-12T03:00:00.000Z"),
      status: "published",
      ...overrides,
    }),
    questions: buildQuestions(glossary),
    source: {
      branch: "main",
      fetchType: "github_repository",
      kind: "docs",
      licenseSpdx: "CC-BY-4.0",
      licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
      name: "React 公式ドキュメント",
      publicUrlStripPrefix: "src/content/",
      publicUrlTemplate: "https://react.dev/{path}",
      repository: "reactjs/react.dev",
      tags: ["react"],
    },
  }
}

/**
 * 挑戦（既定は FIXED_NOW の 14 時間前に開始した挑戦中）
 */
export const buildAttempt = (overrides: Partial<ReadingAttempt> = {}): ReadingAttempt => ({
  id: 301,
  correctCount: null,
  elapsedSeconds: null,
  isOvertime: null,
  passageId: 1,
  questionCount: null,
  startedAt: new Date("2026-10-12T10:00:00.000Z"),
  status: "in_progress",
  studyDate: null,
  submittedAt: null,
  timeLimitSeconds: 180,
  translatedBlockCount: 0,
  userId: 7,
  wordLookupCount: 0,
  createdAt: new Date("2026-10-12T10:00:00.000Z"),
  updatedAt: new Date("2026-10-12T10:00:00.000Z"),
  ...overrides,
})

/**
 * 解答中の形の出典（buildAttemptContent のソース・問題から作ったもの）
 */
export const EXPECTED_ATTRIBUTION = {
  commitSha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  pageUrl: "https://react.dev/learn/synchronizing-with-effects",
  permalinkUrl:
    "https://github.com/reactjs/react.dev/blob/3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b/src/content/learn/synchronizing-with-effects.md",
  retrievedAt: new Date("2026-10-12T03:00:00.000Z"),
  sourceKind: "docs",
  sourceName: "React 公式ドキュメント",
}
