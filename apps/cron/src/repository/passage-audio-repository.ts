import type { PassageAudio, PassageAudioManifest, PassageBlock } from "@repo/domain"

/**
 * 生成タスクが確保した行を指すトークン。結果の書き込みは `WHERE passage_id = ? AND status = 'generating' AND generation_started_at = ?` で行い、
 * 処理が 30 分を超えて別の実行に回収・再確保された行を、古い実行が上書きしないようにする
 */
export type AudioClaim = {
  generationStartedAt: Date
  passageId: number
}

/**
 * 生成タスクが確保した問題
 */
export type ClaimedAudioTarget = AudioClaim & {
  /**
   * 確保した時点の本文
   */
  blocks: PassageBlock[]
  /**
   * 確保する前の行（pending / ready）。確保で行を作ったときは null。manifest と textHash は最後に成功した生成のもの
   * （pending に戻された行でも、前に成功していれば値を持つ）
   */
  previous: Pick<PassageAudio, "manifest" | "status" | "textHash"> | null
}

/**
 * 1 件の生成の結果
 *
 * - ready: 音声を作った
 * - unchanged: 前の成功のマニフェストがあり、その本文のハッシュが今の本文と同じだった（状態を問わない。作り直さない）
 * - failed: 音声合成・保存に失敗した（失敗回数を増やし、maxAttempts に達したら failed）
 */
export type AudioClaimOutcome =
  | { billedCharacters: number; kind: "ready"; manifest: PassageAudioManifest; textHash: string; voiceId: string }
  | { kind: "unchanged"; textHash: string }
  | { error: string; kind: "failed"; maxAttempts: number }

/**
 * completeClaim の結果
 *
 * - ready / unchanged: ready にした
 * - failed: 失敗が上限に達して failed にした
 * - retry_later: 失敗したので pending に戻した（次の実行でやり直す）
 * - text_changed: 生成中に本文が変わった（非公開 → 修正 → 再公開）ので ready にせず pending に戻した
 * - lost_claim: 確保が 30 分を過ぎて回収・再確保されていた（何も書かない）
 */
export type AudioClaimResult = "failed" | "lost_claim" | "ready" | "retry_later" | "text_changed" | "unchanged"

/**
 * 本文から text_hash を求める関数。service が voice を閉じ込めて渡す（Repository は lib を知らない）
 */
export type CalculateTextHash = (blocks: PassageBlock[]) => string

/**
 * cron 側で必要な読み上げの音声の操作（generate:audio）
 */
export interface PassageAudioRepository {
  /**
   * 公開済みの問題のうち、音声の行が無い・pending・ready で音声を作った後に公開し直された（updated_at < published_at）・
   * ready で voice_id が voiceId（今の voice）と違うものを、published_at の古い順に最大 limit 件、generating にしながら取る
   * （短いトランザクションで FOR UPDATE SKIP LOCKED）。行が無ければ作る（text_hash は calculateTextHash の値、voice_id は voiceId）。
   * 既にある行は status・generation_started_at・updated_at だけを更新し、manifest・text_hash・voice_id は前の成功のまま残す
   */
  claimTargets(input: { calculateTextHash: CalculateTextHash; limit: number; now: Date; voiceId: string }): Promise<ClaimedAudioTarget[]>
  /**
   * 確保した行に結果を書く（短いトランザクション）。ready / unchanged のときは今の本文の hash を求め直し、outcome.textHash と違えば pending に戻す
   */
  completeClaim(
    claim: AudioClaim,
    outcome: AudioClaimOutcome,
    options: { calculateTextHash: CalculateTextHash; now: Date },
  ): Promise<AudioClaimResult>
  /**
   * 失敗回数を増やさずに pending に戻す（設定の誤りでタスクを止めるとき）。確保が古ければ何もしない
   */
  releaseClaim(claim: AudioClaim): Promise<void>
  /**
   * generating のまま generation_started_at が startedBefore より前の行を pending に戻し、件数を返す（前回の実行が途中で落ちた行の回収）
   */
  releaseStaleGenerating(startedBefore: Date): Promise<number>
}
