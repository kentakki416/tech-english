import { StyleSheet, Text } from "react-native"

import type { PassageAttributionResponse } from "@repo/api-schema"

import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

import { ExternalLinkText } from "./ExternalLinkText"

/**
 * 取得元のコミットの短い SHA（GitHub の表示に合わせて 7 文字）
 */
export const SHORT_SHA_LENGTH = 7

/**
 * 本文の下の出典の注記（content-collection README「出典表示」。web の AttributionNote と同じ内容）。
 * ソース名は取得元のページ、ライセンス名はライセンスの記載へのリンク。取得時点は GitHub ならコミットへの固定リンク、サイトなら取得日
 */
export function AttributionNote({ attribution }: { attribution: PassageAttributionResponse }) {
  const { commit_sha: commitSha, permalink_url: permalinkUrl } = attribution
  return (
    <Text style={styles.note}>
      出典：<ExternalLinkText url={attribution.page_url}>{attribution.source_name}</ExternalLinkText>
      （<ExternalLinkText url={attribution.license_url}>{attribution.license_spdx}</ExternalLinkText>、
      {commitSha !== null && permalinkUrl !== null ? (
        <>
          コミット <ExternalLinkText url={permalinkUrl}><Text style={styles.sha}>{commitSha.slice(0, SHORT_SHA_LENGTH)}</Text></ExternalLinkText> 時点
        </>
      ) : (
        `${attribution.retrieved_at.slice(0, 10)} 時点`
      )}
      ）。一部を抜粋・改変しています。
    </Text>
  )
}

const styles = StyleSheet.create({
  note: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
    lineHeight: 17,
  },
  sha: {
    fontFamily: THEME_FONTS.code,
  },
})
