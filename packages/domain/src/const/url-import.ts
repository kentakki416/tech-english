/**
 * URL から取り込むときの、塊ごとの「保存したときにどうなるか」
 *
 * - duplicated: 同じ内容の本文候補が、生成中・下書き・公開済み・却下・失敗のどれかにある。何もしない（admin はその本文候補へのリンクを出す）
 * - existing: 同じ内容の未生成（collected）の本文候補がある（別の URL の文書のものも含む）。増えないが、生成を優先する
 * - generated_section: 同じ文書に同じ見出しの、生成中・下書き・公開済み・生成した後に却下した本文候補がある。作らない
 * - new: 新しい本文候補として保存する
 * - not_candidate: 本文候補の条件を満たさない
 */
export const URL_IMPORT_CHUNK_STATUSES = ["duplicated", "existing", "generated_section", "new", "not_candidate"] as const

/**
 * URL から取り込めない理由（400 の details[0].code）
 *
 * - blocked_url: サイトの外を指す・正規化できない URL（SSRF 対策で弾くアドレスを含む）
 * - crawl_delay_too_long: robots.txt の Crawl-delay が api の上限を超える
 * - deadline_exceeded: 取得が期限（始めてから 15 秒）までに終わらない
 * - extraction_failed: 本文を抽出できない（ソースの CSS セレクタが不正）
 * - github_source: GitHub のソースで収集しているサイトのページ
 * - http_error: ページが HTTP エラーを返した（details の message に status）
 * - network_error: タイムアウト・接続エラー
 * - not_html: HTML のページではない
 * - out_of_target_path: ソースの対象パス・除外パス・拡張子に合わない
 * - redirect_not_allowed: サイトの外へのリダイレクト
 * - redirected_out_of_target: リダイレクトの行き先が対象パスの外
 * - robots_disallowed: robots.txt で禁止されている
 * - robots_unavailable: robots.txt を読めない（5xx・ネットワークエラー）
 * - source_not_found: 同じオリジンのサイトのソースが無い
 * - throttled: サイトが 429 / 503 を返した
 * - too_large: ページが大きすぎる
 * - too_many_redirects: リダイレクトが多すぎる
 */
export const URL_IMPORT_ERROR_CODES = [
  "blocked_url",
  "crawl_delay_too_long",
  "deadline_exceeded",
  "extraction_failed",
  "github_source",
  "http_error",
  "network_error",
  "not_html",
  "out_of_target_path",
  "redirect_not_allowed",
  "redirected_out_of_target",
  "robots_disallowed",
  "robots_unavailable",
  "source_not_found",
  "throttled",
  "too_large",
  "too_many_redirects",
] as const
