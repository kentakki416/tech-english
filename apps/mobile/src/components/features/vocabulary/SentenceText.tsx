import { Fragment } from "react"
import { type StyleProp, StyleSheet, Text, type TextStyle } from "react-native"

import type { GetVocabularySessionResponse } from "@repo/api-schema"

import { splitInlineCode } from "@/components/features/passage/passage-text"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

type VocabularySentence = NonNullable<GetVocabularySessionResponse["cards"][number]["sentence"]>

/**
 * 紙の上の文字を端末の文字サイズの設定でどこまで大きくするか。紙の高さは決まっているので、大きくしすぎると意味が切れる
 */
export const PAPER_MAX_FONT_SCALE = 1.3

/**
 * バッククォートのインラインコードを、紙の上のコードの見た目で描く（入れ子の Text）
 */
function InkText({ text }: { text: string }) {
  return (
    <>
      {splitInlineCode(text).map((part, index) =>
        part.isCode
          ? <Text key={index} style={styles.inlineCode}>{part.text}</Text>
          : <Fragment key={index}>{part.text}</Fragment>,
      )}
    </>
  )
}

/**
 * 本文の 1 文。単語に蛍光ペンのような琥珀の塗りを付ける（本文の根拠の強調と同じ考え方で、紙の上なので少し濃くする）。
 * 1 文を再生している間は塗りを濃くする（入れ子の Text は影を付けられず、ネイティブで動かせないため、web のように光らせない）
 */
export function SentenceText({
  isPlaying = false,
  numberOfLines,
  sentence,
  style,
}: {
  isPlaying?: boolean
  numberOfLines?: number
  sentence: VocabularySentence
  style?: StyleProp<TextStyle>
}) {
  return (
    <Text maxFontSizeMultiplier={PAPER_MAX_FONT_SCALE} numberOfLines={numberOfLines} style={[styles.sentence, style]}>
      <InkText text={sentence.text.slice(0, sentence.highlight_start)} />
      <Text style={[styles.highlight, isPlaying && styles.highlightPlaying]}>
        <InkText text={sentence.text.slice(sentence.highlight_start, sentence.highlight_end)} />
      </Text>
      <InkText text={sentence.text.slice(sentence.highlight_end)} />
    </Text>
  )
}

const styles = StyleSheet.create({
  highlight: {
    backgroundColor: "rgba(243, 178, 76, 0.45)",
    color: THEME_COLORS.ink,
  },
  highlightPlaying: {
    backgroundColor: "rgba(243, 178, 76, 0.8)",
  },
  /**
   * 大きさは周りの文に合わせる（見本・表・裏で文の大きさが違うため）
   */
  inlineCode: {
    backgroundColor: "rgba(216, 201, 172, 0.6)",
    color: THEME_COLORS.ink,
    fontFamily: THEME_FONTS.code,
  },
  sentence: {
    fontFamily: THEME_FONTS.reading,
    lineHeight: 24,
  },
})
