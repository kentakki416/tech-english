import type { GlossaryEntry, PassageBlock, VocabularyCard, VocabularyGrade } from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * 見出し語ごとの、最後に出会った場所（カードの中身の材料）。意味が用意できる見出し語だけを返す
 */
export type VocabularyEncounter = {
  /**
   * 見出し語と一致する英和辞書の項目の意味。無ければ null
   */
  dictionaryMeaningJa: string | null
  /**
   * 用語集の行が使えるとき（残っていて、問題が公開中）。使えなければ null
   */
  glossary: Pick<
    GlossaryEntry,
    "blockIndex" | "endOffset" | "id" | "meaningJa" | "noteJa" | "partOfSpeech" | "startOffset" | "surface"
  > | null
  /**
   * 正規化した見出し語（小文字）
   */
  lemma: string
  /**
   * 出会った問題。本文は公開中のときだけ（公開中でなければ null）
   */
  passage: { blocks: PassageBlock[] | null; id: number; title: string }
  /**
   * 調べたとき・用語集の本文中の表記
   */
  surface: string
}

/**
 * 今日の復習のカードと、その中身の材料
 */
export type DueVocabularyCard = {
  card: Pick<VocabularyCard, "dueDate" | "id" | "lemma" | "stage">
  encounter: VocabularyEncounter
}

/**
 * 単語帳のトップの数
 */
export type VocabularyCounts = {
  dueCount: number
  learningCount: number
  masteredCount: number
  newCount: number
  /**
   * 今日より後で一番近い、次に出す日。無ければ null
   */
  nextDueDate: string | null
}

/**
 * 答えの保存の入力。カードは (user_id, lemma) で upsert する
 */
export type SaveVocabularyReviewInput = {
  activeSeconds: number
  clientReviewId: string
  /**
   * 答えた後の次に出す日。覚えた単語は null
   */
  dueDate: string | null
  grade: VocabularyGrade
  lemma: string
  reviewedAt: Date
  stageAfter: number
  stageBefore: number | null
  studyDate: string
  userId: number
}

/**
 * 単語帳（vocabulary_cards / vocabulary_reviews と、出題の候補）のリポジトリ。
 * 候補は attempt_word_lookups と、提出した挑戦の問題の passage_glossary_entries から都度集める（vocabulary-cards README「1 回分の選び方」）
 */
export interface VocabularyRepository {
  /**
   * 見出し語のカード。無ければ null
   */
  findCardByLemma(userId: number, lemma: string, tx: TransactionContext): Promise<VocabularyCard | null>
  /**
   * 今日の復習（due_date <= today）を due_date, id の昇順で limit 枚。中身の材料が無い（意味が用意できない）カードは飛ばす
   */
  findDueCards(userId: number, today: string, limit: number): Promise<DueVocabularyCard[]>
  /**
   * 新しい単語（カードの無い見出し語）を優先順に limit 件。
   * 調べた単語（調べたのが新しい順）→ 読んだ本文の用語集（提出したのが新しい問題から、本文に出てくる順）
   */
  findNewEncounters(userId: number, limit: number): Promise<VocabularyEncounter[]>
  /**
   * client_review_id の答えが保存済みなら、そのカードの今の状態。無ければ null
   */
  findReviewedCard(userId: number, clientReviewId: string, tx: TransactionContext): Promise<VocabularyCard | null>
  /**
   * 見出し語が出題の候補にあり、意味が用意できるか
   */
  hasEncounter(userId: number, lemma: string, tx: TransactionContext): Promise<boolean>
  /**
   * 同じユーザーの答えの保存を直列にするため、users の行を FOR NO KEY UPDATE でロックする。ユーザーが無ければ false
   */
  lockUserForReview(userId: number, tx: TransactionContext): Promise<boolean>
  /**
   * カードを upsert し、答えを 1 行足す（同じ tx の中で呼ぶ）。保存後のカードを返す
   */
  saveReview(input: SaveVocabularyReviewInput, tx: TransactionContext): Promise<VocabularyCard>
  /**
   * 単語帳のトップの数。今日の復習と新しい単語は、意味が用意できる見出し語だけを数える
   */
  summarize(userId: number, today: string): Promise<VocabularyCounts>
}
