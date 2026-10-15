import type {
  GitHubRepositorySource,
  GlossaryEntry,
  Passage,
  PassageAudio,
  PassageBlock,
  PassageDifficulty,
  PassageStatus,
  Question,
  SourceKind,
  WebsiteSource,
} from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * admin の問題一覧のカーソル（並びのキー）。draft は needsAttention DESC, updatedAt ASC, id ASC、
 * それ以外は updatedAt DESC, id DESC の並びで、この行より後ろを返す（それ以外の状態では needsAttention を使わない）
 */
export type AdminPassageListCursor = { id: number; needsAttention: boolean; updatedAt: Date }

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
  /**
   * 読み上げの音声。行がまだ無ければ null
   */
  audio: PassageAudio | null
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
 * 却下を取り消した後の状態（設問があれば draft、無ければ collected）
 */
export type RestoredPassageStatus = Extract<PassageStatus, "collected" | "draft">

/**
 * ユーザー向けの公開中の問題の絞り込み。difficulties / tags は空なら絞り込まず、指定したらどれかに当てはまるもの（OR）
 */
export type PublishedPassageFilter = {
  difficulties: PassageDifficulty[]
  kind: SourceKind | null
  /**
   * タグの名前の完全一致（大文字・小文字も区別する）
   */
  tags: string[]
  /**
   * 指定するとそのユーザーが提出済みの問題を除く（挑戦中・期限切れだけの問題は残す）
   */
  unattemptedByUserId: number | null
}

/**
 * ユーザー向けの問題一覧のカーソル。published_at DESC, id DESC の並びで、この行より後ろを返す
 */
export type PassageCursor = { id: number; publishedAt: Date }

type PassageSourceTags = {
  /**
   * ソースのタグの名前（lower(name) → id の順）
   */
  tags: string[]
}

/**
 * 出典と一覧の表示に使うソースの列（取得方法ごとに持つ列が違う）
 */
export type PassageSource =
  | (Pick<
    GitHubRepositorySource,
    "branch" | "fetchType" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "publicUrlStripPrefix" | "publicUrlTemplate" | "repository"
  > & PassageSourceTags)
  | (Pick<WebsiteSource, "fetchType" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "siteUrl"> & PassageSourceTags)

/**
 * blocks を読まない一覧用の列。公開中の問題は difficulty / publishedAt / timeLimitSeconds が必ずある（公開の条件と公開の操作で埋まる）
 */
export type PassageOverview = Pick<Passage, "id" | "sourceCommitSha" | "sourcePath" | "sourceRetrievedAt" | "title" | "wordCount"> & {
  difficulty: PassageDifficulty
  publishedAt: Date
  timeLimitSeconds: number
}

export type PublishedPassageSummary = { passage: PassageOverview; questionCount: number; source: PassageSource }

/**
 * 挑戦の画面（解答中・結果）に出す問題の内容。用語集は blockIndex → startOffset → id の順、設問は orderIndex の順
 */
export type AttemptContent = { glossary: GlossaryEntry[]; passage: Passage; questions: Question[]; source: PassageSource }

export interface PassageRepository {
  /**
   * 要確認の印を外す（needs_attention = false、attention_reasons = []）。状態は問わず、外れていても書く。行が無ければ false
   */
  clearAttention(id: number): Promise<boolean>
  /**
   * 状態ごとの件数（絞り込みなしの全体）。行が無い状態は 0 で埋める
   */
  countByStatus(): Promise<Record<PassageStatus, number>>
  /**
   * 絞り込みに当てはまる公開中の問題の件数
   */
  countPublished(filter: PublishedPassageFilter): Promise<number>
  /**
   * admin の問題の詳細（読み上げの音声の行も読む）。存在しなければ null
   */
  findAdminDetail(id: number): Promise<AdminPassageDetail | null>
  /**
   * limit + 1 件まで返す（has_more の判定は service）
   */
  findAdminList(query: AdminPassageListQuery): Promise<AdminPassageListItem[]>
  /**
   * 挑戦の画面に出す問題の内容。状態を問わない（非公開に戻された問題の挑戦中・提出済みも表示するため）。存在しなければ null
   */
  findAttemptContentById(passageId: number): Promise<AttemptContent | null>
  /**
   * 公開中の問題の概要。公開中でなければ null
   */
  findPublishedById(id: number): Promise<PublishedPassageSummary | null>
  /**
   * 公開中の問題を published_at DESC, id DESC の順に、cursor の行より後ろから limit 件まで返す（次のページの有無は service が limit + 1 を渡して判定する）
   */
  findPublishedPage(filter: PublishedPassageFilter, page: { cursor: PassageCursor | null; limit: number }): Promise<PublishedPassageSummary[]>
  /**
   * 公開中の問題があるソースのタグの名前を、重複なしで lower(name) → id の順に返す
   */
  findPublishedTags(): Promise<string[]>
  /**
   * 絞り込みに当てはまる公開中の問題からランダムに 1 つの id を返す。無ければ null
   */
  findRandomPublishedId(filter: PublishedPassageFilter): Promise<number | null>
  /**
   * 生成した内容（設問・用語集・和訳・難易度・制限時間・生成の記録・却下の理由・確認の記録・要確認）を消して collected に戻し、
   * generation_attempt_count を 0 にする。英文とタイトルは残す。
   * 状態が from に無い・挑戦が 1 件でもあるときは何もせず false（同時操作の保護）
   */
  resetForRegeneration(id: number, from: PassageStatus[]): Promise<boolean>
  /**
   * 却下（rejected）を取り消す。設問があれば draft に戻して却下の理由を消す（設問・用語集・和訳・要確認・確認の記録は残す）。
   * 設問が無ければ（LLM が不向きと判定したもの）resetForRegeneration と同じく生成の記録を空にして collected に戻す。
   * 戻した状態を返す。rejected でなければ何もせず null（同時操作の保護）
   */
  restoreRejected(id: number): Promise<RestoredPassageStatus | null>
  /**
   * 状態を遷移させる。状態が from に無ければ何もせず false（同時操作の保護）。tx を渡すとそのトランザクションで書く
   */
  transitionStatus(id: number, transition: PassageTransition, tx?: TransactionContext): Promise<boolean>
  /**
   * 下書きの内容（passages の列・用語集・設問）を 1 トランザクションで置き換える。
   * リクエストに無い用語集・設問は削除し、id のあるものは更新、id が null のものは追加する。draft でなければ何もせず false
   */
  updateDraftContent(id: number, content: DraftEditContent): Promise<boolean>
}
