/**
 * 読み上げの音声の状態（docs/spec/read-aloud/README.md「音声ができるまで」）
 *
 * - pending: 生成待ち（失敗して次の実行に回った・管理者が再試行した・回収されたものを含む）
 * - generating: 生成タスクが確保している間
 * - ready: 音声とマニフェストがある
 * - failed: 生成が 3 回失敗した。管理者が再試行するまで自動では作り直さない
 */
export const AUDIO_STATUSES = ["pending", "generating", "ready", "failed"] as const
