import type { Passage, ReadingAttempt } from "@repo/domain"

import type { AttemptContent, PassageOverview, PassageSource, PublishedPassageSummary } from "../../../src/repository"
import { buildGlossaryEntries, buildPassage, buildQuestions } from "../../fixture/passage-content"

/**
 * passage-service のユニットテストで共有する値。Repository のモックは test/fixture/passage-repository-mock.ts を使う
 */

export const FIXED_NOW = new Date("2026-10-13T00:00:00.000Z")

/**
 * 問題のソース（React 公式ドキュメント）
 */
const PASSAGE_SOURCE: PassageSource = {
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
}

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
  source: PASSAGE_SOURCE,
})

/**
 * 非公開に戻された（draft の）問題の内容（test/fixture/passage-content.ts の本文・用語集・設問 3 問）。開始確認の再開用の概要に使う
 */
export const buildUnpublishedAttemptContent = (overrides: Partial<Passage> = {}): AttemptContent => {
  const glossary = buildGlossaryEntries()
  return {
    glossary,
    passage: buildPassage({
      publishedAt: new Date("2026-10-12T03:00:00.000Z"),
      reviewedAt: new Date("2026-10-12T03:00:00.000Z"),
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      status: "draft",
      ...overrides,
    }),
    questions: buildQuestions(glossary),
    source: PASSAGE_SOURCE,
  }
}

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
