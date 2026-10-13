import type { ReadingAttempt } from "@repo/domain"

import type { PassageOverview, PublishedPassageSummary } from "../../../src/repository"

/**
 * passage-service のユニットテストで共有する値。Repository のモックは test/fixture/passage-repository-mock.ts を使う
 */

export const FIXED_NOW = new Date("2026-10-13T00:00:00.000Z")

/**
 * 公開中の問題の概要（id と公開日時だけ変えられる）
 */
export const buildPublishedSummary = (
  id: number,
  overrides: Partial<PassageOverview> = {},
): PublishedPassageSummary => ({
  passage: {
    id,
    difficulty: 2,
    publishedAt: new Date("2026-10-12T03:00:00.000Z"),
    sourceCommitSha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
    sourcePath: "src/content/learn/synchronizing-with-effects.md",
    sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
    timeLimitSeconds: 180,
    title: "Synchronizing with Effects",
    wordCount: 60,
    ...overrides,
  },
  questionCount: 3,
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
})

/**
 * 挑戦中の挑戦
 */
export const buildInProgressAttempt = (overrides: Partial<ReadingAttempt> = {}): ReadingAttempt => ({
  id: 301,
  correctCount: null,
  elapsedSeconds: null,
  isOvertime: null,
  listenedBlockCount: 0,
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
