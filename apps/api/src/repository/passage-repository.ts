import type {
  GlossaryEntry,
  Passage,
  PassageBlock,
  PassageDifficulty,
  PassageStatus,
  Question,
} from "@repo/domain"

/**
 * admin の問題一覧のカーソル（並びのキー）。draft は needsAttention DESC, updatedAt ASC, id ASC、
 * それ以外は updatedAt DESC, id DESC の並びで、この行より後ろを返す（それ以外の状態では needsAttention を使わない）
 */
export type AdminPassageListCursor = { id: number; needsAttention: boolean; updatedAt: Date }

/**
 * admin の問題一覧の条件
 */
export type AdminPassageListQuery = {
  cursor: AdminPassageListCursor | null
  /**
   * 1 ページの件数。Repository は limit + 1 件まで返す
   */
  limit: number
  needsAttention?: boolean
  sourceId?: number
  status: PassageStatus
}

/**
 * 問題のソース（content_sources）の表示に使う列
 */
export type AdminPassageSource = { id: number; name: string }

/**
 * admin の問題一覧の 1 行
 */
export type AdminPassageListItem = {
  /**
   * 挑戦の件数（状態を問わない）
   */
  attemptCount: number
  passage: Passage
  questionCount: number
  source: AdminPassageSource
}

/**
 * admin の問題の詳細。用語集は blockIndex → startOffset → id の順、設問は orderIndex の順
 */
export type AdminPassageDetail = {
  /**
   * 挑戦の件数（状態を問わない。挑戦中のユーザーも設問 ID に回答を送るため）
   */
  attemptCount: number
  glossary: GlossaryEntry[]
  passage: Passage
  questions: Question[]
  source: AdminPassageSource
}

/**
 * 下書きの保存で置き換える内容。id が null の用語集・設問は新規
 */
export type DraftEditContent = {
  blocks: PassageBlock[]
  difficulty: PassageDifficulty
  glossary: (Pick<
    GlossaryEntry,
    "blockIndex" | "endOffset" | "lemma" | "meaningJa" | "noteJa" | "partOfSpeech" | "startOffset" | "surface"
  > & { id: number | null })[]
  questions: (Pick<
    Question,
    "choices" | "correctChoiceIndex" | "evidenceBlockIndex" | "evidenceQuote" | "explanationJa" | "orderIndex" | "prompt" | "type"
  > & {
    id: number | null
    /**
     * 同じ内容の glossary の index（vocabulary 以外は null）
     */
    targetGlossaryIndex: number | null
  })[]
  timeLimitSeconds: number
  title: string
}

/**
 * 問題の状態を遷移させるときに書く値。省略した列は変えない
 */
export type PassageTransition = {
  /**
   * この状態のどれかのときだけ遷移する
   */
  from: PassageStatus[]
  publishedAt?: Date
  rejectReason?: string
  reviewedAt?: Date
  to: PassageStatus
}

/**
 * 問題（passages と、その設問・用語集）のリポジトリ。reading-practice のユーザー向け API と共有する
 */
export interface PassageRepository {
  /**
   * 状態ごとの件数（絞り込みなしの全体）。行が無い状態は 0 で埋める
   */
  countByStatus(): Promise<Record<PassageStatus, number>>
  findAdminDetail(id: number): Promise<AdminPassageDetail | null>
  /**
   * limit + 1 件まで返す（has_more の判定は service）
   */
  findAdminList(query: AdminPassageListQuery): Promise<AdminPassageListItem[]>
  /**
   * 生成した内容（設問・用語集・和訳・難易度・制限時間・生成の記録・却下の理由・確認の記録・要確認）を消して collected に戻し、
   * generation_attempt_count を 0 にする。英文とタイトルは残す。
   * 状態が from に無い・挑戦が 1 件でもあるときは何もせず false（同時操作の保護）
   */
  resetForRegeneration(id: number, from: PassageStatus[]): Promise<boolean>
  /**
   * 状態を遷移させる。状態が from に無ければ何もせず false（同時操作の保護）
   */
  transitionStatus(id: number, transition: PassageTransition): Promise<boolean>
  /**
   * 下書きの内容（passages の列・用語集・設問）を 1 トランザクションで置き換える。
   * リクエストに無い用語集・設問は削除し、id のあるものは更新、id が null のものは追加する。draft でなければ何もせず false
   */
  updateDraftContent(id: number, content: DraftEditContent): Promise<boolean>
}
