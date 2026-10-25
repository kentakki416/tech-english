/**
 * 1 ソースの収集が最後まで動いたときの終わり方（docs/spec/manual-collection/README.md「収集の状態」）。収集の失敗（failed）は含まない
 *
 * - completed: 対象の文書を全部処理した（last_collected_commit_sha を更新する）
 * - limit_reached: 文書数・本文候補数の上限で打ち切った。またはツリーが切り詰められて全部を列挙できなかった
 * - rate_limited: GitHub の rate limit の残りが閾値を切ったので打ち切った
 * - up_to_date: 前回の収集から取得元が変わっていない
 */
export const SOURCE_COLLECTION_RESULT_STATUSES = ["completed", "limit_reached", "rate_limited", "up_to_date"] as const

/**
 * 収集中の状態。queued は api が記録を作った後（Queue に積む前から）、running は worker が取り出した後
 */
export const ACTIVE_SOURCE_COLLECTION_RUN_STATUSES = ["queued", "running"] as const

/**
 * 収集の実行の記録（source_collection_runs.status）の状態。
 * failed は収集が失敗した・api が Queue に積めなかった・収集中のまま時間切れで片付けられた
 */
export const SOURCE_COLLECTION_RUN_STATUSES = [
  ...ACTIVE_SOURCE_COLLECTION_RUN_STATUSES,
  ...SOURCE_COLLECTION_RESULT_STATUSES,
  "failed",
] as const
