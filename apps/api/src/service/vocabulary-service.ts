import { type User, VOCABULARY_SESSION_SIZE } from "@repo/domain"
import { err, ok, Result, unauthorizedError } from "@repo/errors"

import { buildVocabularyCard, type VocabularyCardView } from "../lib/build-vocabulary-card"
import { formatDateInTimeZone } from "../lib/time-zone"
import type { UserRepository, VocabularyCounts, VocabularyRepository } from "../repository"

/**
 * 1 回分のカード
 */
export type VocabularySession = { cards: VocabularyCardView[]; today: string }

type VocabularyReadRepo = { userRepository: UserRepository; vocabularyRepository: VocabularyRepository }

/**
 * 「今日」を求めるのにタイムゾーンが要るため、読み取りの API でもユーザーが無ければ 401 にする（learning-record と同じ）
 */
const findUser = async (userId: number, repo: { userRepository: UserRepository }): Promise<Result<User>> => {
  const user = await repo.userRepository.findById(userId)
  if (!user) return err(unauthorizedError("User not found"))
  return ok(user)
}

/**
 * 単語帳のトップの数（今日の復習・新しい単語・復習中・覚えた単語・次の復習の日）
 */
export const getVocabularySummary = async (
  userId: number,
  repo: VocabularyReadRepo,
  deps: { now: Date },
): Promise<Result<VocabularyCounts>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const today = formatDateInTimeZone(deps.now, userResult.value.timezone)
  return ok(await repo.vocabularyRepository.summarize(userId, today))
}

/**
 * 1 回分のカード（最大 VOCABULARY_SESSION_SIZE 枚）。今日の復習を先に入れ、余った枠を新しい単語で埋める。何も書き込まない
 */
export const getVocabularySession = async (
  userId: number,
  repo: VocabularyReadRepo,
  deps: { now: Date },
): Promise<Result<VocabularySession>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const today = formatDateInTimeZone(deps.now, userResult.value.timezone)

  const dueCards = await repo.vocabularyRepository.findDueCards(userId, today, VOCABULARY_SESSION_SIZE)
  const restCount = VOCABULARY_SESSION_SIZE - dueCards.length
  const newEncounters = restCount > 0 ? await repo.vocabularyRepository.findNewEncounters(userId, restCount) : []

  const cards = [
    ...dueCards.map(({ card, encounter }) => buildVocabularyCard(encounter, card.stage)),
    ...newEncounters.map((encounter) => buildVocabularyCard(encounter, null)),
  ].filter((card): card is VocabularyCardView => card !== null)
  return ok({ cards, today })
}
