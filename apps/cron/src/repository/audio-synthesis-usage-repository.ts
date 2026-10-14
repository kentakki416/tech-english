/**
 * 音声合成で課金された文字数の記録（audio_synthesis_usages。追記だけ）。generate:audio が月の上限（AUDIO_MONTHLY_CHARACTER_LIMIT）を見るのに使う
 */
export interface AudioSynthesisUsageRepository {
  /**
   * 1 回のリクエストで課金された文字数を 1 行書く
   */
  record(input: { characters: number; now: Date; passageId: number }): Promise<void>
  /**
   * since 以降（created_at >= since）に記録した文字数の合計（primary から読む）。記録が無ければ 0
   */
  sumCharactersSinceFromPrimary(since: Date): Promise<number>
}
