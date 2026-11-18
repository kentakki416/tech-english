/**
 * 課金の記録が何の音声合成のものか。読み上げは問題、単語の発音は word_audios の行
 */
export type AudioSynthesisUsageTarget = { passageId: number } | { wordAudioId: number }

/**
 * 音声合成で課金された文字数の記録（audio_synthesis_usages。追記だけ）
 */
export interface AudioSynthesisUsageRepository {
  /**
   * 1 回のリクエストで課金された文字数を 1 行書く
   */
  record(input: { characters: number; now: Date; target: AudioSynthesisUsageTarget }): Promise<void>
  /**
   * since 以降（created_at >= since）に記録した文字数の合計（読み上げと単語の発音の合算）。記録が無ければ 0
   */
  sumCharactersSinceFromPrimary(since: Date): Promise<number>
}
