import type { PassageAttributionResponse } from "@repo/api-schema"

const LINK_CLASS = "underline decoration-line-strong underline-offset-2 outline-none hover:text-fg-muted hover:decoration-fg-faint focus-visible:ring-2 focus-visible:ring-amber/60"

/**
 * 取得元のコミットの短い SHA（GitHub の表示に合わせて 7 文字）
 */
const SHORT_SHA_LENGTH = 7

function ExternalLink({ children, href }: { children: React.ReactNode, href: string }) {
  /**
   * 解答中の画面を離れないよう別のタブで開く（タブを離れている間はタイマーが止まる）
   */
  return (
    <a className={LINK_CLASS} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  )
}

/**
 * 本文の下の出典の注記（content-collection README「出典表示」）。
 * ソース名は取得元のページ、ライセンス名はライセンスの記載へのリンク。取得時点は GitHub ならコミットへの固定リンク、サイトなら取得日
 */
export function AttributionNote({ attribution }: { attribution: PassageAttributionResponse }) {
  const { commit_sha: commitSha, permalink_url: permalinkUrl } = attribution
  return (
    <p className="mt-10 border-t border-line pt-4 pl-11 text-xs leading-relaxed text-fg-faint sm:pl-14">
      出典：<ExternalLink href={attribution.page_url}>{attribution.source_name}</ExternalLink>
      （<ExternalLink href={attribution.license_url}>{attribution.license_spdx}</ExternalLink>、
      {commitSha !== null && permalinkUrl !== null ? (
        <>コミット <ExternalLink href={permalinkUrl}><span className="font-code">{commitSha.slice(0, SHORT_SHA_LENGTH)}</span></ExternalLink> 時点</>
      ) : (
        /**
         * サーバー描画とずれないよう、日付は ISO 文字列の先頭をそのまま出す
         */
        `${attribution.retrieved_at.slice(0, 10)} 時点`
      )}
      ）。一部を抜粋・改変しています。
    </p>
  )
}
