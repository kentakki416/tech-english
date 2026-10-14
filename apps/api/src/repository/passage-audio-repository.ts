import type { Passage, PassageAudio } from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * 問題の読み上げの音声と、問題の状態・公開日時（非公開に戻されたか・音声を作った後に公開し直されたかの判定に使う）
 */
export type PassageAudioWithPassage = {
  /**
   * 音声の行がまだ無ければ null
   */
  audio: PassageAudio | null
  passage: Pick<Passage, "publishedAt" | "status">
}

/**
 * 問題の読み上げの音声（passage_audios）のリポジトリ。行を作る・生成の結果を書くのは cron の generate:audio で、
 * api は読み取りと、admin の再試行（failed → pending。公開でも行う）・作り直しの依頼だけを行う
 */
export interface PassageAudioRepository {
  /**
   * passages に passage_audios を left join して読む（passages の状態と公開日時も）。問題が無ければ null
   */
  findByPassageId(passageId: number): Promise<PassageAudioWithPassage | null>
  /**
   * status = 'ready' のときだけ作り直しを依頼する（regenerate_requested_at = now、attempt_count = 0、last_error = null）。
   * updated_at は変えない（公開し直しの判定〈updated_at < published_at〉を崩さないため）。行が無い・ready でないときは何もせず false
   */
  requestRegeneration(passageId: number, now: Date): Promise<boolean>
  /**
   * status = 'failed' のときだけ pending に戻す（attempt_count = 0、last_error = null）。
   * 行が無い・failed でない（同時に状態が変わった）ときは何もせず false。tx を渡すとそのトランザクションで書く
   */
  resetFailed(passageId: number, tx?: TransactionContext): Promise<boolean>
}
