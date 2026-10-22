/**
 * 1 ソースの収集の終わり方（docs/spec/manual-collection/README.md「収集の状態」）
 *
 * - completed: 対象の文書を全部処理した（last_collected_commit_sha を更新する）
 * - limit_reached: 文書数・本文候補数の上限で打ち切った。またはツリーが切り詰められて全部を列挙できなかった
 * - rate_limited: GitHub の rate limit の残りが閾値を切ったので打ち切った
 * - up_to_date: 前回の収集から取得元が変わっていない
 */
export const SOURCE_COLLECTION_RESULT_STATUSES = ["completed", "limit_reached", "rate_limited", "up_to_date"] as const

/**
 * 収集中の状態。queued は api が Queue に積んだ後、running は worker が取り出した後
 */
export const ACTIVE_SOURCE_COLLECTION_RUN_STATUSES = ["queued", "running"] as const

/**
 * 収集の実行の記録（source_collection_runs.status）の状態。failed は収集が失敗したか、時間切れで片付けられた
 */
export const SOURCE_COLLECTION_RUN_STATUSES = [
  ...ACTIVE_SOURCE_COLLECTION_RUN_STATUSES,
  ...SOURCE_COLLECTION_RESULT_STATUSES,
  "failed",
] as const

/**
 * 収集中のまま、この分数を過ぎた記録は終わらなかったとみなして failed にする。
 * worker が止まって記録が収集中のまま残ると、そのソースを二度と収集できなくなるため。
 * 1 回の上限（100 文書）を GitHub API で取って抽出する時間に十分な余裕を持たせた（generate:questions の回収と同じ長さ）
 */
export const SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES = 30
