import {
  isVocabularyCardDue,
  normalizeVocabularyLemma,
  scheduleVocabularyReview,
  type User,
  VOCABULARY_MAX_CARD_SECONDS,
  VOCABULARY_SESSION_SIZE,
  type VocabularyCard,
  type VocabularyGrade,
} from "@repo/domain"
import { err, notFoundError, ok, Result, unauthorizedError } from "@repo/errors"

import { buildVocabularyCard, type VocabularyCardView } from "../lib/build-vocabulary-card"
import { formatDateInTimeZone } from "../lib/time-zone"
import type { TransactionRunner, UserRepository, VocabularyCounts, VocabularyRepository } from "../repository"

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

/**
 * 答えた後のカードの状態
 */
export type VocabularyReviewResult = Pick<VocabularyCard, "dueDate" | "lemma" | "stage">

const convertCardToReviewResult = (card: VocabularyCard): VocabularyReviewResult => ({
  dueDate: card.dueDate,
  lemma: card.lemma,
  stage: card.stage,
})

/**
 * 1 枚の答えを保存する。次の段階と次に出す日は users.timezone での今日から求める（vocabulary-cards README「復習の間隔」）。
 *
 * - 同じ client_review_id の答えが保存済みなら何もせず、そのカードの今の状態を返す（冪等）
 * - 今日の分ではないカード（次に出す日が今日より後・覚えた単語）への答えは保存せず、そのカードの今の状態を返す。
 *   戻るボタンで古い 1 回分を開き直して答えた・別の端末で先に答えた、のような重なった答えで段階を 2 つ進めないため
 * - カードが無く、出題の候補にも無い（意味が用意できない）見出し語は 404
 * - 見ていた秒数は VOCABULARY_MAX_CARD_SECONDS に切り詰める
 */
export const reviewVocabularyCard = async (
  userId: number,
  input: { activeSeconds: number; clientReviewId: string; grade: VocabularyGrade; lemma: string },
  repo: { transactionRunner: TransactionRunner; userRepository: UserRepository; vocabularyRepository: VocabularyRepository },
  deps: { now: Date },
): Promise<Result<VocabularyReviewResult>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const today = formatDateInTimeZone(deps.now, userResult.value.timezone)
  const lemma = normalizeVocabularyLemma(input.lemma)
  const activeSeconds = Math.min(input.activeSeconds, VOCABULARY_MAX_CARD_SECONDS)

  return repo.transactionRunner.run(async (tx): Promise<Result<VocabularyReviewResult>> => {
    /**
     * 同じユーザーの答えを直列にする。通信のやり直しで同じ答えが同時に届いても、後の方は先の方の行を見て何もしない。
     * ここでユーザーの有無も確かめ直す（その間に削除されたら 401。外部キー違反の 500 にしない）
     */
    const isLocked = await repo.vocabularyRepository.lockUserForReview(userId, tx)
    if (!isLocked) return err(unauthorizedError("User not found"))

    const reviewed = await repo.vocabularyRepository.findReviewedCard(userId, input.clientReviewId, tx)
    if (reviewed) return ok(convertCardToReviewResult(reviewed))

    const card = await repo.vocabularyRepository.findCardByLemma(userId, lemma, tx)
    if (!card && !(await repo.vocabularyRepository.hasEncounter(userId, lemma, tx))) {
      return err(notFoundError("Word not found in the vocabulary"))
    }
    if (card && !isVocabularyCardDue(card, today)) return ok(convertCardToReviewResult(card))

    const stageBefore = card?.stage ?? null
    const schedule = scheduleVocabularyReview(stageBefore, input.grade, today)
    const saved = await repo.vocabularyRepository.saveReview(
      {
        activeSeconds,
        clientReviewId: input.clientReviewId,
        dueDate: schedule.dueDate,
        grade: input.grade,
        lemma,
        reviewedAt: deps.now,
        stageAfter: schedule.stage,
        stageBefore,
        studyDate: today,
        userId,
      },
      tx,
    )
    return ok(convertCardToReviewResult(saved))
  })
}
