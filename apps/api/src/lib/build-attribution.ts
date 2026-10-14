import type { Passage, SourceKind } from "@repo/domain"

import type { PassageSource } from "../repository"

/**
 * 出典表示（content-collection の「出典表示」）に出す内容
 */
export type PassageAttribution = {
  /**
   * 取得時のコミット。サイトは null
   */
  commitSha: string | null
  licenseSpdx: string
  licenseUrl: string
  /**
   * 公開ページの URL（URL 規則が無ければ GitHub のファイル）/ サイトのページ
   */
  pageUrl: string
  /**
   * GitHub のコミットに固定したリンク。サイトとコミットが無いものは null
   */
  permalinkUrl: string | null
  retrievedAt: Date
  sourceKind: SourceKind
  sourceName: string
}

/**
 * 公開ページの URL を作るときにファイルパスから外す拡張子
 */
const MARKDOWN_EXTENSION_PATTERN = /\.mdx?$/

/**
 * 公開ページの URL 規則の {path} に、ファイルパスから取り除くプレフィックスと拡張子（.md / .mdx）を外したものを入れる。
 * admin のソースの登録で出す「変換の例」と同じ規則（プレフィックスで始まらないパスはそのまま使う）
 */
const buildPublicPageUrl = (template: string, stripPrefix: string | null, sourcePath: string): string => {
  const path = stripPrefix && sourcePath.startsWith(stripPrefix) ? sourcePath.slice(stripPrefix.length) : sourcePath
  return template.replace("{path}", path.replace(MARKDOWN_EXTENSION_PATTERN, ""))
}

/**
 * 問題の出典表示を組み立てる。リンクはソースの今の設定と、問題が取得した時点の値（パス・コミット・取得日時）から作る
 */
export const buildAttribution = (
  source: PassageSource,
  passage: Pick<Passage, "sourceCommitSha" | "sourcePath" | "sourceRetrievedAt">,
): PassageAttribution => {
  const common = {
    commitSha: passage.sourceCommitSha,
    licenseSpdx: source.licenseSpdx,
    licenseUrl: source.licenseUrl,
    retrievedAt: passage.sourceRetrievedAt,
    sourceKind: source.kind,
    sourceName: source.name,
  }
  if (source.fetchType === "website") {
    return { ...common, pageUrl: new URL(passage.sourcePath, source.siteUrl).toString(), permalinkUrl: null }
  }
  const repositoryUrl = `https://github.com/${source.repository}`
  return {
    ...common,
    pageUrl: source.publicUrlTemplate
      ? buildPublicPageUrl(source.publicUrlTemplate, source.publicUrlStripPrefix, passage.sourcePath)
      : `${repositoryUrl}/blob/${source.branch}/${passage.sourcePath}`,
    permalinkUrl: passage.sourceCommitSha ? `${repositoryUrl}/blob/${passage.sourceCommitSha}/${passage.sourcePath}` : null,
  }
}
