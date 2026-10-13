import type { PassageAudio } from "@repo/domain"

/**
 * 問題の読み上げの音声と、問題の公開日時（音声を作った後に公開し直されたかの判定に使う）
 */
export type PassageAudioWithPassage = {
  /**
   * 音声の行がまだ無ければ null
   */
  audio: PassageAudio | null
  passagePublishedAt: Date | null
}

/**
 * 問題の読み上げの音声（passage_audios）のリポジトリ。行を作る・生成の結果を書くのは cron の generate:audio で、
 * api は読み取りと、admin の再試行（failed → pending）だけを行う
 */
export interface PassageAudioRepository {
  /**
   * passages に passage_audios を left join して読む。問題が無ければ null
   */
  findByPassageId(passageId: number): Promise<PassageAudioWithPassage | null>
  /**
   * status = 'failed' のときだけ pending に戻す（attempt_count = 0、last_error = null）。
   * 行が無い・failed でない（同時に状態が変わった）ときは何もせず false
   */
  resetFailed(passageId: number): Promise<boolean>
}
