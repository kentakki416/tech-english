import { useCallback, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

import { splitDictionarySenses } from "./passage-text"

/**
 * 単語のカードの意味の部分。辞書は結果を待つ間 loading で、届いたら埋める
 */
export type WordMeaning =
  | { lemma: string, meaningJa: string, noteJa: string | null, partOfSpeech: string | null, status: "glossary" }
  | { lemma: string, meaningJa: string, status: "dictionary" }
  | { status: "failed" }
  | { status: "loading" }
  | { status: "not_found" }

export type WordCardContent = {
  meaning: WordMeaning
  /**
   * 単語を押すたびに増える番号。辞書の結果（loading の後に届く中身）は、同じ番号のカードを開いている間だけ反映する
   */
  requestId: number
  surface: string
}

/**
 * 単語のカードの状態。PassageReader の onWordCard に showWordCard を渡す。
 * 辞書の結果を待つ間にカードを閉じた・別の単語を押したら、後から届いた結果でカードを開き直さない
 */
export function useWordCard(): {
  closeWordCard: () => void
  showWordCard: (content: WordCardContent) => void
  wordCard: WordCardContent | null
} {
  const [wordCard, setWordCard] = useState<WordCardContent | null>(null)

  const showWordCard = useCallback((content: WordCardContent) => {
    const isFirstContent = content.meaning.status === "loading" || content.meaning.status === "glossary"
    setWordCard(current => (isFirstContent || current?.requestId === content.requestId ? content : current))
  }, [])

  const closeWordCard = useCallback(() => setWordCard(null), [])

  return { closeWordCard, showWordCard, wordCard }
}

/**
 * 単語のカード（画面の下端に全幅で出す。置き場所は画面が決める）。
 * 出どころは、用語集なら琥珀の点と「この文での意味」、辞書なら灰の点と「英和辞書（一般的な意味）」
 */
export function WordCard({ content, onClose }: { content: WordCardContent, onClose: () => void }) {
  const { meaning, surface } = content
  const subline = meaning.status === "glossary"
    ? { lemma: meaning.lemma, partOfSpeech: meaning.partOfSpeech }
    : meaning.status === "dictionary"
      ? { lemma: meaning.lemma, partOfSpeech: null }
      : null
  const isLemmaVisible = subline !== null && subline.lemma.toLowerCase() !== surface.toLowerCase()
  const isGlossary = meaning.status === "glossary"

  return (
    <View accessibilityLabel={`${surface} の意味`} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.surface}>{surface}</Text>
          {subline !== null && (isLemmaVisible || subline.partOfSpeech) && (
            <Text style={styles.meta}>
              {isLemmaVisible ? `${subline.lemma}  ` : ""}
              {subline.partOfSpeech ?? ""}
            </Text>
          )}
        </View>
        <Pressable accessibilityLabel="閉じる" accessibilityRole="button" hitSlop={12} onPress={onClose}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>

      {meaning.status === "loading" ? (
        <View accessibilityLabel="意味を調べています" style={styles.skeleton}>
          <View style={[styles.skeletonLine, styles.skeletonLineLong]} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
        </View>
      ) : meaning.status === "not_found" ? (
        <Text style={styles.note}>辞書に見つかりませんでした。</Text>
      ) : meaning.status === "failed" ? (
        <Text style={styles.note}>意味を取得できませんでした。もう一度押してください。</Text>
      ) : meaning.status === "dictionary" ? (
        /**
         * 辞書は語義が多い語があるので、カードの高さを抑えて中だけスクロールする
         */
        <ScrollView nestedScrollEnabled style={styles.senses}>
          {splitDictionarySenses(meaning.meaningJa).map((sense, index) => (
            <Text key={index} style={styles.sense}>{sense}</Text>
          ))}
        </ScrollView>
      ) : (
        <>
          <Text style={styles.meaning}>{meaning.meaningJa}</Text>
          {meaning.noteJa && <Text style={styles.note}>{meaning.noteJa}</Text>}
        </>
      )}

      <View style={styles.source}>
        <View style={[styles.sourceDot, isGlossary && styles.sourceDotGlossary]} />
        <Text style={[styles.sourceText, isGlossary && styles.sourceTextGlossary]}>
          {isGlossary ? "この文での意味" : "英和辞書（一般的な意味）"}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME_COLORS.raised,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
  },
  close: {
    color: THEME_COLORS.fgFaint,
    fontSize: 22,
    lineHeight: 22,
  },
  header: {
    flexDirection: "row",
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  meaning: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  meta: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    marginTop: 2,
  },
  note: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  sense: {
    color: THEME_COLORS.fg,
    fontSize: 14,
    lineHeight: 22,
  },
  senses: {
    marginTop: 10,
    maxHeight: 176,
  },
  skeleton: {
    gap: 8,
    marginTop: 14,
  },
  skeletonLine: {
    backgroundColor: THEME_COLORS.lineStrong,
    borderRadius: 4,
    height: 12,
  },
  skeletonLineLong: {
    width: "80%",
  },
  skeletonLineShort: {
    width: "50%",
  },
  source: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  sourceDot: {
    backgroundColor: THEME_COLORS.fgFaint,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  sourceDotGlossary: {
    backgroundColor: THEME_COLORS.amber,
  },
  sourceText: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
  },
  sourceTextGlossary: {
    color: THEME_COLORS.amber,
  },
  surface: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.readingSemiBold,
    fontSize: 20,
  },
})
