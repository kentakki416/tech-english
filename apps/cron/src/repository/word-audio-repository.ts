import type { WordAudio } from "@repo/domain"

/**
 * 確保したときの行の状態。
 *
 * - generating: まだ行が無い見出し語（insert）・pending（作り直し待ち）。作る間は api が「準備中」として扱う
 * - ready: voice が今と違う ready。状態を ready のまま確保し、作り直す間も前の音声を出し続ける
 */
export type WordAudioClaimStatus = Extract<WordAudio["status"], "generating" | "ready">

/**
 * 生成タスクが確保した見出し語。結果の書き込みは `WHERE id = ? AND status = claimedStatus AND generation_started_at = ?` で行い、
 * 処理が 30 分を超えて別の実行に回収・再確保された行を、古い実行が上書きしないようにする
 */
export type ClaimedWordAudio = {
  claimedStatus: WordAudioClaimStatus
  generationStartedAt: Date
  id: number
  lemma: string
  /**
   * 前の成功の mp3 のキー。voice の変更で作り直したとき、新しいキーと違えば消す。まだ成功していなければ null
   */
  previousAudioKey: string | null
}

/**
 * 1 語の生成の結果。ready は音声を作って保存した、failed は音声合成・保存に失敗した（失敗回数を増やす）
 */
export type WordAudioClaimOutcome =
  | { audioKey: string; billedCharacters: number; kind: "ready"; textHash: string; voiceId: string }
  | { error: string; kind: "failed"; maxAttempts: number }

/**
 * completeClaim の結果
 *
 * - ready: ready にした
 * - failed: 失敗が上限に達した。generating で確保した行は failed にし、ready のまま確保した行は ready のまま前の音声を出し続ける
 * - retry_later: 失敗したが上限に達していない。generating で確保した行は pending に戻し、ready のまま確保した行は ready のまま（次の実行でやり直す）
 * - lost_claim: 確保が 30 分を過ぎて回収・再確保されていた（何も書かない）
 */
export type WordAudioClaimResult = "failed" | "lost_claim" | "ready" | "retry_later"

/**
 * cron 側で必要な単語の発音の音声の操作（generate:word-audio。vocabulary-pronunciation README「単語の音声の生成タスク」）
 */
export interface WordAudioRepository {
  /**
   * 短いトランザクションで次の順に limit 件まで確保して commit する。
   * ① pending（作り直し待ち。FOR UPDATE SKIP LOCKED）。generating にする
   * ② まだ行が無い見出し語：調べた単語のうち英和辞書の見出し語と一致するもの（調べたのが新しい順）→ 公開中の問題の用語集の語句（公開の新しい順）。
   *    generating の行を insert する（ON CONFLICT (lemma) DO NOTHING。実行が重なっても二重に確保しない）。候補の順に返す
   * ③ voice が今と違う ready（確保中でなく、失敗が maxAttempts 未満。FOR UPDATE SKIP LOCKED）。ready のまま generation_started_at だけを入れる。
   *    作り直す間も前の音声を出せるので最後にする（voice を変えた直後も、新しく出た見出し語を先に作る）
   */
  claimTargets(input: { limit: number; maxAttempts: number; now: Date; staleBefore: Date; voiceId: string }): Promise<ClaimedWordAudio[]>
  /**
   * 確保した時刻を条件に結果を書く（条件に合わなければ lost_claim で何も書かない）。
   * ready は audio_key・text_hash・voice_id・billed_characters・generated_at を入れ、attempt_count = 0・last_error = null。
   * failed は attempt_count を増やして last_error を残し、audio_key・text_hash は前の成功のまま残す（前の mp3 を後で消すため）
   */
  completeClaim(claim: ClaimedWordAudio, outcome: WordAudioClaimOutcome, now: Date): Promise<WordAudioClaimResult>
  /**
   * 確保を外す（失敗回数を増やさない）。generating は pending に戻し、ready のまま確保した行は generation_started_at だけを null に戻す。
   * 月の上限・設定の誤りで止めるときに使う
   */
  releaseClaim(claim: ClaimedWordAudio): Promise<void>
  /**
   * generating のまま startedBefore より前に確保された行を pending に戻す（件数を返す）。前回の実行が途中で落ちた場合の回収
   */
  releaseStaleGenerating(startedBefore: Date): Promise<number>
}
