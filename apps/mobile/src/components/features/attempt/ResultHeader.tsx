import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"

import type { PassageAttributionResponse, ResultQuestion, ResultWordLookup, SubmittedAttempt } from "@repo/api-schema"

import { SourceMeta } from "@/components/features/passage/SourceMeta"
import { appStyles } from "@/components/ui/app-styles"
import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { formatSeconds } from "@/libs/format"

import { SHORT_SHA_LENGTH } from "./AttributionNote"
import { ExternalLinkText } from "./ExternalLinkText"
import { ResultQuestionItem } from "./ResultQuestionItem"

/**
 * 時間のバーの全幅は制限時間の 1.25 倍
 */
const TIME_BAR_MAX_RATIO = 1.25

type ResultHeaderProps = {
  /**
   * 本文で根拠をハイライトしている設問
   */
  highlightQuestionId: number | null
  result: SubmittedAttempt
  onShowEvidence: (question: ResultQuestion) => void
}

/**
 * スコアと時間（surface の区画）。タイトル・36px の正誤のマス（順に灯る）・正答数・かかった時間と時間のバー・読む速さ・アシストの使用
 */
function ResultSummary({ result }: { result: SubmittedAttempt }) {
  const { elapsed_seconds: elapsedSeconds, time_limit_seconds: timeLimitSeconds } = result
  const timeRatio = timeLimitSeconds > 0 ? Math.min(elapsedSeconds / timeLimitSeconds, TIME_BAR_MAX_RATIO) : TIME_BAR_MAX_RATIO

  return (
    <View style={styles.summary}>
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{result.passage.title}</Text>
      <View style={styles.squares}>
        <ScoreSquares isAnimated results={result.questions.map(question => question.is_correct)} size={36} />
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.score}>{result.correct_count} / {result.question_count}</Text>
        <Text style={appStyles.caption}>問正解</Text>
      </View>

      <Text style={[appStyles.caption, styles.timeCaption]}>かかった時間</Text>
      <View style={styles.timeRow}>
        <Text style={styles.metric}>{formatSeconds(elapsedSeconds)}</Text>
        <Text style={appStyles.caption}>／ 制限 {formatSeconds(timeLimitSeconds)}</Text>
        {result.is_overtime && <Text style={styles.overtimeBadge}>{formatSeconds(elapsedSeconds - timeLimitSeconds)} 超過</Text>}
      </View>
      <View style={styles.timeTrack}>
        <View
          style={[
            styles.timeFill,
            { backgroundColor: result.is_overtime ? THEME_COLORS.wrong : THEME_COLORS.amber, width: `${(timeRatio / TIME_BAR_MAX_RATIO) * 100}%` },
          ]}
        />
        <View style={[styles.timeLimitMark, { left: `${(1 / TIME_BAR_MAX_RATIO) * 100}%` }]} />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricColumn}>
          <Text style={appStyles.caption}>読む速さ</Text>
          <Text style={styles.metricSmall}>{result.words_per_minute ?? "―"} WPM</Text>
          <Text style={styles.faint}>設問を解く時間を含む</Text>
        </View>
        <View style={styles.metricColumn}>
          <Text style={appStyles.caption}>アシストの使用</Text>
          <Text style={styles.metricSmall}>和訳 {result.translated_block_count} 段落</Text>
          <Text style={styles.metricSmall}>単語 {result.word_lookup_count} 回</Text>
          <Text style={styles.metricSmall}>読み上げ {result.listened_block_count} 段落</Text>
        </View>
      </View>
    </View>
  )
}

/**
 * 調べた単語（サーバーが重複を除いた一覧）。語句・意味・出どころ（用語集は「文脈」、辞書は「辞書」）
 */
function WordLookupSection({ lookups }: { lookups: ResultWordLookup[] }) {
  return (
    <View style={styles.section}>
      <Text style={appStyles.sectionTitle}>調べた単語</Text>
      {lookups.length === 0 ? (
        <Text style={styles.empty}>この挑戦では単語を調べていません。</Text>
      ) : (
        lookups.map((lookup, index) => (
          <View key={`${lookup.source}-${lookup.lemma}-${index}`} style={styles.lookupRow}>
            <Text style={styles.lookupSurface}>{lookup.surface}</Text>
            <Text style={styles.lookupMeaning}>{lookup.meaning_ja ?? "―"}</Text>
            <Text style={[styles.lookupSource, lookup.source === "glossary" && styles.lookupSourceGlossary]}>
              {lookup.source === "glossary" ? "文脈" : "辞書"}
            </Text>
          </View>
        ))
      )}
    </View>
  )
}

/**
 * 出典（content-collection README「出典表示」）。ページ・取得時点（GitHub はコミットへの固定リンク、サイトは取得日）・ライセンス・改変の表示
 */
function AttributionSection({ attribution }: { attribution: PassageAttributionResponse }) {
  const { commit_sha: commitSha, permalink_url: permalinkUrl } = attribution
  return (
    <View style={styles.section}>
      <Text style={appStyles.sectionTitle}>出典</Text>
      <View style={styles.sourceMeta}>
        <SourceMeta kind={attribution.source_kind} name={attribution.source_name} />
      </View>
      <Text numberOfLines={1} style={styles.attribution}>
        <ExternalLinkText style={styles.link} url={attribution.page_url}>{attribution.page_url.replace(/^https?:\/\//, "")}</ExternalLinkText>
      </Text>
      <Text style={styles.attribution}>
        取得時点：
        {commitSha !== null && permalinkUrl !== null ? (
          <ExternalLinkText style={styles.link} url={permalinkUrl}>
            コミット <Text style={styles.sha}>{commitSha.slice(0, SHORT_SHA_LENGTH)}</Text>
          </ExternalLinkText>
        ) : (
          `${attribution.retrieved_at.slice(0, 10)} 時点の内容`
        )}
        {"　ライセンス："}
        <ExternalLinkText style={styles.link} url={attribution.license_url}>{attribution.license_spdx}</ExternalLinkText>
      </Text>
      <Text style={styles.faint}>一部を抜粋・改変しています。</Text>
    </View>
  )
}

/**
 * 結果画面の本文より上の区画（本文の FlatList の ListHeaderComponent）。
 * スコアと時間 → 設問ごとの結果 → 調べた単語 → 出典 → 本文の見出し、の順に縦に並べる。
 * 不正解の設問は最初から開き、正解の設問は閉じておく（行を押すと開閉）
 */
export function ResultHeader({ highlightQuestionId, result, onShowEvidence }: ResultHeaderProps) {
  const [openQuestionIds, setOpenQuestionIds] = useState<Set<number>>(
    () => new Set(result.questions.filter(question => !question.is_correct).map(question => question.id)),
  )

  const toggleQuestion = (questionId: number) => {
    setOpenQuestionIds((current) => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  return (
    <View>
      <ResultSummary result={result} />

      <View accessibilityLabel="設問ごとの結果">
        {result.questions.map((question, index) => (
          <ResultQuestionItem
            key={question.id}
            isHighlighted={highlightQuestionId === question.id}
            isOpen={openQuestionIds.has(question.id)}
            number={index + 1}
            question={question}
            onShowEvidence={onShowEvidence}
            onToggle={toggleQuestion}
          />
        ))}
      </View>

      <WordLookupSection lookups={result.word_lookups} />
      <AttributionSection attribution={result.attribution} />

      <View style={styles.passageHeading}>
        <Text style={[appStyles.caption, styles.passageCaption]}>本文（根拠の箇所をハイライトしています）</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  attribution: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  empty: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    marginTop: 10,
  },
  faint: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
    marginTop: 4,
  },
  link: {
    color: THEME_COLORS.fg,
  },
  lookupMeaning: {
    color: THEME_COLORS.fgMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  lookupRow: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
  },
  lookupSource: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
  },
  lookupSourceGlossary: {
    color: THEME_COLORS.amber,
  },
  lookupSurface: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 15,
    width: 104,
  },
  metric: {
    color: THEME_COLORS.fg,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  metricColumn: {
    flex: 1,
  },
  metricSmall: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    marginTop: 3,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 18,
  },
  overtimeBadge: {
    borderColor: "rgba(240, 140, 140, 0.5)",
    borderRadius: 4,
    borderWidth: 1,
    color: THEME_COLORS.wrong,
    fontSize: 11,
    paddingHorizontal: 5,
  },
  passageCaption: {
    marginLeft: 40,
  },
  passageHeading: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 14,
    paddingTop: 20,
  },
  score: {
    color: THEME_COLORS.fg,
    fontSize: 34,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  scoreRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  section: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  sha: {
    fontFamily: THEME_FONTS.code,
  },
  sourceMeta: {
    marginTop: 8,
  },
  squares: {
    marginTop: 16,
  },
  summary: {
    backgroundColor: THEME_COLORS.surface,
    padding: 20,
  },
  timeCaption: {
    marginTop: 20,
  },
  timeFill: {
    borderRadius: 3,
    height: 6,
  },
  timeLimitMark: {
    backgroundColor: THEME_COLORS.fgMuted,
    height: 14,
    position: "absolute",
    top: -4,
    width: 1,
  },
  timeRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  timeTrack: {
    backgroundColor: THEME_COLORS.heat0,
    borderRadius: 3,
    height: 6,
    marginTop: 8,
  },
  title: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 16,
  },
})
