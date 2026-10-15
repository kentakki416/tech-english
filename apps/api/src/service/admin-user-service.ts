import type { AdminUserSort, User } from "@repo/domain"
import { err, notFoundError, ok, Result } from "@repo/errors"

import type {
  AdminUserListItem,
  AuthAccountRepository,
  LearningRecordRepository,
  UserGoalRepository,
  UserRepository,
  VocabularyCounts,
  VocabularyRepository,
} from "../repository"

import { getUserAttempts, getUserCalendar, getUserStats, type UserAttempts, type UserCalendar, type UserStats } from "./learning-record-service"
import { getVocabularySummary } from "./vocabulary-service"

/**
 * ユーザーの詳細に使う Repository（マイページの学習のまとめと単語帳の数に、ログイン方法を足したもの）
 */
type AdminUserRepo = {
  authAccountRepository: AuthAccountRepository
  learningRecordRepository: LearningRecordRepository
  userGoalRepository: UserGoalRepository
  userRepository: UserRepository
  vocabularyRepository: VocabularyRepository
}

type AdminUserLearningRecordRepo = { learningRecordRepository: LearningRecordRepository; userRepository: UserRepository }

export type AdminUserList = { items: AdminUserListItem[]; limit: number; page: number; total: number }

export type AdminUserDetail = {
  stats: UserStats
  user: User & { lastStudiedDate: string | null; providers: string[] }
  vocabulary: VocabularyCounts
}

/**
 * ユーザーが居るか確かめる。マイページの Service はユーザーが居ないと 401（本人のトークンの検査の一部）を返すので、
 * admin では先にこれで確かめて 404 にする
 */
const findUserForAdmin = async (userId: number, repo: { userRepository: UserRepository }): Promise<Result<User>> => {
  const user = await repo.userRepository.findById(userId)
  if (!user) return err(notFoundError("User not found"))
  return ok(user)
}

/**
 * マイページの Service の 401（確かめた後に退会してユーザーが消えたとき）を、admin では 404 に読み替える
 */
const convertMissingUserToNotFound = <T>(result: Result<T>): Result<T> =>
  !result.ok && result.error.statusCode === 401 ? err(notFoundError("User not found")) : result

/**
 * ユーザー一覧（page は 1 始まり。範囲外のページは空の配列で、total は全体の件数）
 */
export const getAdminUserList = async (
  query: { limit: number; order: "asc" | "desc"; page: number; q?: string; sort: AdminUserSort },
  repo: { userRepository: UserRepository },
): Promise<Result<AdminUserList>> => {
  const { items, total } = await repo.userRepository.findForAdmin({
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
    order: query.order,
    q: query.q,
    sort: query.sort,
  })
  return ok({ items, limit: query.limit, page: query.page, total })
}

/**
 * ユーザーの詳細。基本の情報・ログイン方法・最後に学習した日に、マイページと同じ学習のまとめと単語帳の数を足す。ユーザーが居なければ notFoundError
 */
export const getAdminUser = async (
  userId: number,
  repo: AdminUserRepo,
  deps: { now: Date },
): Promise<Result<AdminUserDetail>> => {
  const userResult = await findUserForAdmin(userId, repo)
  if (!userResult.ok) return userResult

  const [statsResult, vocabularyResult, providers, studyDates] = await Promise.all([
    getUserStats(userId, repo, deps),
    getVocabularySummary(userId, repo, deps),
    repo.authAccountRepository.findProvidersByUserId(userId),
    repo.learningRecordRepository.findStudyDates(userId),
  ])
  if (!statsResult.ok) return convertMissingUserToNotFound(statsResult)
  if (!vocabularyResult.ok) return convertMissingUserToNotFound(vocabularyResult)

  return ok({
    stats: statsResult.value,
    user: { ...userResult.value, lastStudiedDate: studyDates[studyDates.length - 1] ?? null, providers },
    vocabulary: vocabularyResult.value,
  })
}

/**
 * 学習カレンダー（マイページと同じ）。ユーザーが居なければ notFoundError
 */
export const getAdminUserCalendar = async (
  userId: number,
  range: { from?: string; to?: string },
  repo: AdminUserLearningRecordRepo,
  deps: { now: Date },
): Promise<Result<UserCalendar>> => {
  const userResult = await findUserForAdmin(userId, repo)
  if (!userResult.ok) return userResult
  return convertMissingUserToNotFound(await getUserCalendar(userId, range, repo, deps))
}

/**
 * 学習履歴（マイページと同じ）。ユーザーが居なければ notFoundError
 */
export const getAdminUserAttempts = async (
  userId: number,
  query: { cursor?: number; date?: string; limit: number },
  repo: AdminUserLearningRecordRepo,
): Promise<Result<UserAttempts>> => {
  const userResult = await findUserForAdmin(userId, repo)
  if (!userResult.ok) return userResult
  return convertMissingUserToNotFound(await getUserAttempts(userId, query, repo))
}
