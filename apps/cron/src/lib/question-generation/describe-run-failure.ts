/**
 * generate:questions の 1 回の実行の件数（service の GenerateQuestionsResult のうち、成否の判定に使うもの）
 */
export type GenerateQuestionsRunCounts = {
  draftCount: number
  failedCount: number
  rejectedCount: number
  retryLaterCount: number
}

/**
 * 実行を失敗（exit 1）として通知すべきなら、その理由を返す。通知しないなら null。
 *
 * - 失敗の回数が上限に達して failed になった件がある
 * - 取得した全件が一時的な失敗で collected に戻った（下書き・却下が 0 件）。JSON Schema が API に受け付けられないなど、
 *   設定や実装の誤りで毎回全件が失敗するのを、3 回目の failed まで待たずに知らせるため
 */
export const describeRunFailure = (counts: GenerateQuestionsRunCounts): string | null => {
  const reasons: string[] = []
  if (counts.failedCount > 0) {
    reasons.push(`${counts.failedCount} passage(s) reached the attempt limit and were marked as failed`)
  }
  if (counts.draftCount + counts.rejectedCount === 0 && counts.retryLaterCount > 0) {
    reasons.push(`no passage was generated; ${counts.retryLaterCount} passage(s) failed and were returned to collected`)
  }
  return reasons.length > 0 ? `generate-questions: ${reasons.join("; ")}` : null
}
