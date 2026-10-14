import type { VOCABULARY_GRADES } from "../const/vocabulary"

/**
 * 単語帳の答え
 */
export type VocabularyGrade = (typeof VOCABULARY_GRADES)[number]

/**
 * 単語帳のカード（復習の状態だけ。表と裏の中身は出すたびに組み立てる）。1 ユーザー・1 見出し語で 1 行
 */
export type VocabularyCard = {
  id: number
  /**
   * 次に出す日（YYYY-MM-DD。users.timezone での日付）。覚えた単語は null
   */
  dueDate: string | null
  lastReviewedAt: Date
  /**
   * 見出し語の小文字
   */
  lemma: string
  /**
   * 0〜4。4 は覚えた単語
   */
  stage: number
  userId: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 1 枚の答えの記録
 */
export type VocabularyReview = {
  id: number
  /**
   * 見ていた秒数（0〜VOCABULARY_MAX_CARD_SECONDS）
   */
  activeSeconds: number
  cardId: number
  clientReviewId: string
  grade: VocabularyGrade
  stageAfter: number
  /**
   * 新しい単語（答える前にカードが無かった）は null
   */
  stageBefore: number | null
  /**
   * 答えた時点の users.timezone での日付（YYYY-MM-DD）
   */
  studyDate: string
  userId: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 答えた後のカードの段階と次に出す日
 */
export type VocabularySchedule = {
  /**
   * 覚えた単語は null
   */
  dueDate: string | null
  stage: number
}
