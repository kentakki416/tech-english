import type { PASSAGE_BLOCK_TYPES, PASSAGE_DIFFICULTIES, PASSAGE_STATUSES } from "../const/passage"

/**
 * 本文候補 / 問題の状態
 */
export type PassageStatus = (typeof PASSAGE_STATUSES)[number]

/**
 * 難易度
 */
export type PassageDifficulty = (typeof PASSAGE_DIFFICULTIES)[number]

/**
 * 本文のブロックの種別
 */
export type PassageBlockType = (typeof PASSAGE_BLOCK_TYPES)[number]

/**
 * 本文の 1 ブロック。本文はこの配列として passages.blocks（jsonb）に入る
 */
export type PassageBlock = {
  /**
   * code のみ。シンタックスハイライトの言語
   */
  lang?: string
  /**
   * 本文。インラインコードはバッククォートで囲んだまま保持する
   */
  text: string
  /**
   * code 以外。生成で埋める
   */
  translationJa?: string
  type: PassageBlockType
}

/**
 * 本文候補 / 問題。状態（status）で収集から公開までを表す
 */
export type Passage = {
  id: number
  /**
   * 要確認の理由
   */
  attentionReasons: string[]
  blocks: PassageBlock[]
  /**
   * 本文の正規化テキストの SHA-256（重複の排除に使う）
   */
  contentHash: string
  difficulty: PassageDifficulty | null
  generatedAt: Date | null
  generationAttemptCount: number
  generationError: string | null
  generationModel: string | null
  generationPromptVersion: string | null
  generationStartedAt: Date | null
  needsAttention: boolean
  publishedAt: Date | null
  rejectReason: string | null
  reviewedAt: Date | null
  /**
   * 取得時のコミット。GitHub のみ
   */
  sourceCommitSha: string | null
  sourceDocumentId: number
  /**
   * 取得時のファイルパス or URL のパス
   */
  sourcePath: string
  sourceRetrievedAt: Date
  status: PassageStatus
  timeLimitSeconds: number | null
  title: string
  wordCount: number
  createdAt: Date
  updatedAt: Date
}
