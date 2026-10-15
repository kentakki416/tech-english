import { VOCABULARY_GRADES, VOCABULARY_MASTERED_STAGE, VOCABULARY_REVIEW_INTERVAL_DAYS } from "../const/vocabulary"
import type { VocabularyCard, VocabularyGrade, VocabularySchedule } from "../types/vocabulary"

import { addDaysToDate } from "./learning-record"

/**
 * カードが今日の分か（次に出す日が今日以前）。覚えた単語（次に出す日なし）は今日の分ではない。today は users.timezone での今日（YYYY-MM-DD）
 */
export const isVocabularyCardDue = (card: Pick<VocabularyCard, "dueDate">, today: string): boolean =>
  card.dueDate !== null && card.dueDate <= today

export const isVocabularyGrade = (value: string): value is VocabularyGrade =>
  (VOCABULARY_GRADES as readonly string[]).includes(value)

/**
 * 見出し語をカードの単位（vocabulary_cards.lemma）にそろえる。前後の空白を除いて小文字にする
 */
export const normalizeVocabularyLemma = (lemma: string): string => lemma.trim().toLowerCase()

/**
 * 答えから、次の段階と次に出す日を求める（vocabulary-cards README「復習の間隔」）。
 * stageBefore は答える前の段階（新しい単語は null）、today は users.timezone での今日（YYYY-MM-DD）。
 * 「まだ」はどの段階からでも段階 0・翌日。「覚えた」は 1 段階進め、段階 4 に届いたら覚えた単語（次に出す日なし）
 */
export const scheduleVocabularyReview = (
  stageBefore: number | null,
  grade: VocabularyGrade,
  today: string,
): VocabularySchedule => {
  if (grade === "forgot") {
    return { dueDate: addDaysToDate(today, VOCABULARY_REVIEW_INTERVAL_DAYS[0]), stage: 0 }
  }
  const stage = Math.min((stageBefore ?? 0) + 1, VOCABULARY_MASTERED_STAGE)
  if (stage === VOCABULARY_MASTERED_STAGE) return { dueDate: null, stage }
  return { dueDate: addDaysToDate(today, VOCABULARY_REVIEW_INTERVAL_DAYS[stage]), stage }
}
