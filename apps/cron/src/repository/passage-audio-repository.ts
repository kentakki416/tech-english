import type { PassageAudio, PassageAudioManifest, PassageBlock } from "@repo/domain"

/**
 * 確保したときの行の状態。
 *
 * - generating: 行が無い・pending・音声を作った後に公開し直された ready。作る間は利用者に「準備中」と見える
 * - ready: voice が今と違う・admin の作り直しの依頼がある ready（公開し直されていないもの）。状態を ready のまま確保し、
 *   作り直す間も前のマニフェストを返し続ける（updated_at も進めない。api は updated_at < published_at で公開し直しを判定するため）
 */
export type AudioClaimStatus = Extract<PassageAudio["status"], "generating" | "ready">

/**
 * 生成タスクが確保した行を指すトークン。結果の書き込みは `WHERE passage_id = ? AND status = claimedStatus AND generation_started_at = ?` で行い、
 * 処理が 30 分を超えて別の実行に回収・再確保された行を、古い実行が上書きしないようにする
 */
export type AudioClaim = {
  claimedStatus: AudioClaimStatus
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
   * admin の作り直しの依頼があるか（regenerate_requested_at が null でない）。あれば本文の hash が同じでも作り直す
   */
  isRegenerationRequested: boolean
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
 * - unchanged: 前の成功のマニフェストがあり、その本文のハッシュが今の本文と同じで、作り直しの依頼も無かった（状態を問わない。作り直さない）
 * - failed: 音声合成・保存に失敗した（失敗回数を増やす）
 */
export type AudioClaimOutcome =
  | { billedCharacters: number; kind: "ready"; manifest: PassageAudioManifest; textHash: string; voiceId: string }
  | { kind: "unchanged"; textHash: string }
  | { error: string; kind: "failed"; maxAttempts: number }

/**
 * completeClaim の結果
 *
 * - ready / unchanged: ready にした
 * - failed: 失敗が上限に達した。generating で確保した行は failed にし、ready のまま確保した行は ready のまま前の音声を出し続ける
 *   （どちらも管理者の操作〈再試行・作り直し〉まで自動では作り直さない）
 * - retry_later: 失敗したが上限に達していない。generating で確保した行は pending に戻し、ready のまま確保した行は ready のままにする（次の実行でやり直す）
 * - text_changed: 生成中に本文が変わった（非公開 → 修正 → 再公開）ので ready にせず pending に戻した
 * - lost_claim: 確保が 30 分を過ぎて回収・再確保されていた（何も書かない）
 */
export type AudioClaimResult = "failed" | "lost_claim" | "ready" | "retry_later" | "text_changed" | "unchanged"

/**
 * 本文から text_hash を求める関数。service が voice を閉じ込めて渡す（Repository は lib を知らない）
 */
export type CalculateTextHash = (blocks: PassageBlock[]) => string

/**
 * 却下された問題の音声（generate:audio が保存先の mp3 と行を消す）
 */
export type RejectedPassageAudio = Pick<PassageAudio, "manifest" | "passageId">

/**
 * cron 側で必要な読み上げの音声の操作（generate:audio）
 */
export interface PassageAudioRepository {
  /**
   * 公開済みの問題のうち、次の行を published_at の古い順に最大 limit 件取る（短いトランザクションで FOR UPDATE OF passages SKIP LOCKED）。
   *
   * - 行が無い・pending・音声を作った後に公開し直された（updated_at < published_at）ready：generating にして確保する。
   *   行が無ければ作る（text_hash は calculateTextHash の値、voice_id は voiceId）
   * - voice_id が voiceId（今の voice）と違う・作り直しの依頼がある ready（公開し直されていないもの。失敗が maxAttempts 未満のものだけ）：
   *   ready のまま generation_started_at だけを入れて確保する（updated_at は進めない）
   *
   * どちらも、generation_started_at が staleBefore 以降の ready の行（別の実行が ready のまま確保中）は取らない。
   * 既にある行の manifest・text_hash・voice_id は前の成功のまま残す
   */
  claimTargets(input: {
    calculateTextHash: CalculateTextHash
    limit: number
    maxAttempts: number
    now: Date
    staleBefore: Date
    voiceId: string
  }): Promise<ClaimedAudioTarget[]>
  /**
   * 確保した行に結果を書く（短いトランザクション）。ready / unchanged のときは今の本文の hash を求め直し、outcome.textHash と違えば pending に戻す。
   * ready / unchanged にするとき、確保の時刻までに出された作り直しの依頼は消す（確保の後に出された依頼は残し、次の実行で作り直す）
   */
  completeClaim(
    claim: AudioClaim,
    outcome: AudioClaimOutcome,
    options: { calculateTextHash: CalculateTextHash; now: Date },
  ): Promise<AudioClaimResult>
  /**
   * 音声の行を消す（却下された問題の mp3 を消した後）
   */
  deleteByPassageId(passageId: number): Promise<void>
  /**
   * 却下（rejected）された問題の音声の行。generation_started_at が staleBefore 以降の行（確保中）は除く
   */
  findRejected(staleBefore: Date): Promise<RejectedPassageAudio[]>
  /**
   * 確保を外す（設定の誤り・月の上限でタスクを止めるとき）。失敗回数は増やさない。generating で確保した行は pending に戻し、
   * ready のまま確保した行は generation_started_at だけを null にする（updated_at は進めない）。確保が古ければ何もしない
   */
  releaseClaim(claim: AudioClaim): Promise<void>
  /**
   * generating のまま generation_started_at が startedBefore より前の行を pending に戻し、件数を返す（前回の実行が途中で落ちた行の回収）
   */
  releaseStaleGenerating(startedBefore: Date): Promise<number>
}
