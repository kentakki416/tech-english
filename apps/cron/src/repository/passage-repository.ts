import type { GlossaryEntry, Passage, PassageBlock, PassageDifficulty, PassageStatus, Question } from "@repo/domain"

/**
 * 生成タスクが取得した行を指すトークン。更新は `WHERE id = ? AND status = 'generating' AND generation_started_at = ?` で行い、
 * 処理が 30 分を超えて別の実行に回収・再取得された行を、古い実行が上書きしないようにする
 */
export type PassageClaim = {
  generationStartedAt: Date
  id: number
}

/**
 * 生成タスクが取得した本文候補。取得した直後なので generationStartedAt は必ずある
 */
export type ClaimedPassage = Pick<Passage, "blocks" | "generationAttemptCount" | "id" | "title" | "wordCount"> & {
  generationStartedAt: Date
}

/**
 * 下書きとして保存する用語集の項目（insert 前なので id が無い）
 */
export type DraftGlossaryEntry = Pick<
  GlossaryEntry,
  "blockIndex" | "endOffset" | "lemma" | "meaningJa" | "noteJa" | "partOfSpeech" | "startOffset" | "surface"
>

/**
 * 下書きとして保存する設問。用語集は insert 前で id が無いので、`glossary` 配列の index（targetGlossaryIndex）で指す
 */
export type DraftQuestion = Pick<
  Question,
  | "choices"
  | "choicesJa"
  | "correctChoiceIndex"
  | "evidenceBlockIndex"
  | "evidenceQuote"
  | "explanationJa"
  | "orderIndex"
  | "prompt"
  | "promptJa"
  | "type"
  | "verificationChoiceIndex"
> & { targetGlossaryIndex: number | null }

/**
 * 生成した下書き。passages の更新と questions / passage_glossary_entries の insert を 1 トランザクションで保存する
 */
export type DraftContent = {
  /**
   * 空でなければ needs_attention = true
   */
  attentionReasons: string[]
  /**
   * 和訳（translationJa）入りの本文
   */
  blocks: PassageBlock[]
  difficulty: PassageDifficulty
  generationModel: string
  generationPromptVersion: string
  /**
   * 同じ (blockIndex, startOffset, endOffset) の項目を 2 つ持たない（insert 後に位置で id を引くため）
   */
  glossary: DraftGlossaryEntry[]
  questions: DraftQuestion[]
  timeLimitSeconds: number
}

/**
 * cron 側で必要な本文候補の操作（問題生成）
 */
export interface PassageRepository {
  /**
   * collected のうち、生成を優先したもの（generation_prioritized_at の古い順）→ 古いもの（created_at → id）の順で 1 行を、generating にしながら取る（FOR UPDATE SKIP LOCKED。実行が重なっても同じ行を二重に取らない）。
   * generation_started_at は now（取った時刻）になる。生成タスクは 1 件ずつ「取得 → 生成 → 保存」を繰り返す
   * （まとめて取ると全件に同じ時刻が入り、実行が 30 分を超えたときに後半の行が回収・再取得されて二重に生成されるため）。
   * passageId があればその行だけを対象にする。取れる行が無ければ null
   */
  claimNextCollected(input: { now: Date; passageId?: number }): Promise<ClaimedPassage | null>
  countByStatus(status: PassageStatus): Promise<number>
  /**
   * 行が無ければ null（`--passage-id` の行を取れなかったときのメッセージに使う）
   */
  findStatusById(id: number): Promise<PassageStatus | null>
  /**
   * 取得した行が LLM に題材として不向きと判定されたら rejected にする。claim が古ければ何もせず false
   */
  markRejectedByLlm(
    claim: PassageClaim,
    input: { generationModel: string; generationPromptVersion: string; reason: string },
    now: Date,
  ): Promise<boolean>
  /**
   * 失敗回数（generation_attempt_count）を +1 し、maxAttempts に達したら failed、それ以外は collected に戻す（1 文で）。
   * 戻り値は更新後の状態。claim が古ければ何もせず null
   */
  recordGenerationFailure(claim: PassageClaim, input: { error: string; maxAttempts: number }): Promise<"collected" | "failed" | null>
  /**
   * 失敗回数を増やさずに collected へ戻す（API キーやモデル ID の誤りでタスクを止めるとき）
   */
  releaseClaim(claim: PassageClaim): Promise<void>
  /**
   * generating のまま generation_started_at が startedBefore より前の行を collected に戻し、件数を返す（前回の実行が途中で落ちた行の回収）
   */
  releaseStaleGenerating(startedBefore: Date): Promise<number>
  /**
   * passages を draft に更新し、残っている questions / passage_glossary_entries を消して入れ直す（1 トランザクション）。
   * claim が古ければ何もせず false
   */
  saveDraft(claim: PassageClaim, content: DraftContent, now: Date): Promise<boolean>
}
