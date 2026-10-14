import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import type { GetVocabularySessionResponse } from "@repo/api-schema"

import { splitDictionarySenses } from "@/components/features/passage/passage-text"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

import { SentenceText } from "./SentenceText"

export type VocabularyCard = GetVocabularySessionResponse["cards"][number]

/**
 * 束の後ろの 2 枚。手前のカードと合わせて 3 枚に見えるよう、1 枚ごとに下へずらし、横にも少しずらして傾ける（web と同じ）
 */
const STACK_LAYERS: { color: string, transform: ViewStyle["transform"] }[] = [
  { color: "#e1d4ba", transform: [{ translateX: -7 }, { translateY: 22 }, { rotate: "-2.2deg" }] },
  { color: "#ebdfc7", transform: [{ translateX: 5 }, { translateY: 11 }, { rotate: "1.4deg" }] },
]

/**
 * 単語帳のリングを通す穴（パンチで開けた穴から、後ろの暗い画面が見える）
 */
function PunchHole() {
  return (
    <View pointerEvents="none" style={styles.hole}>
      <View style={styles.holeInner} />
    </View>
  )
}

/**
 * 紙の 1 枚（表と裏で共通の地）。読書灯が上から当たっているように、上ほど明るくする
 */
export function PaperSheet({ children, style, tone = "front" }: { children: React.ReactNode, style?: StyleProp<ViewStyle>, tone?: "back" | "front" }) {
  const gradientId = `paper-${tone}`
  return (
    <View style={[styles.sheet, style]}>
      <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={tone === "front" ? "#f7eedc" : "#f1e6d0"} />
            <Stop offset="0.45" stopColor={tone === "front" ? THEME_COLORS.paper : "#ede1ca"} />
            <Stop offset="1" stopColor={THEME_COLORS.paperDeep} />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height="100%" width="100%" />
      </Svg>
      <PunchHole />
      {children}
    </View>
  )
}

/**
 * 語句と、見出し語が違うときの見出し語・品詞
 */
function WordHeading({ card, size }: { card: VocabularyCard, size: "lg" | "sm" }) {
  const hasLemma = card.lemma !== card.surface.toLowerCase()
  return (
    <View style={size === "lg" ? styles.headingLarge : styles.headingSmall}>
      <Text style={size === "lg" ? styles.surfaceLarge : styles.surfaceSmall}>{card.surface}</Text>
      {(hasLemma || card.part_of_speech) && (
        <View style={styles.headingMeta}>
          {hasLemma && <Text style={styles.lemma}>{card.lemma}</Text>}
          {card.part_of_speech && <Text style={styles.partOfSpeech}>{card.part_of_speech}</Text>}
        </View>
      )}
    </View>
  )
}

/**
 * カードの表。語句・本文の 1 文・出典。新しい単語には印を付ける
 */
export function PaperCardFront({ card }: { card: VocabularyCard }) {
  return (
    <View style={styles.face}>
      {card.stage === null && <Text style={styles.newStamp}>新しい単語</Text>}
      <View style={styles.frontBody}>
        <WordHeading card={card} size="lg" />
        {card.sentence && <SentenceText sentence={card.sentence} style={styles.frontSentence} />}
      </View>
      <Text numberOfLines={1} style={styles.source}>— {card.passage.title} より</Text>
    </View>
  )
}

/**
 * カードの裏。表の語句と 1 文を小さく残し、意味・補足・出どころを出す。辞書の意味は語義ごとに行を分ける
 */
export function PaperCardBack({ card }: { card: VocabularyCard }) {
  const senses = card.meaning_source === "dictionary" ? splitDictionarySenses(card.meaning_ja) : [card.meaning_ja]
  return (
    <View style={styles.face}>
      <WordHeading card={card} size="sm" />
      {card.sentence && <SentenceText numberOfLines={2} sentence={card.sentence} style={styles.backSentence} />}
      <View style={styles.fold} />
      <View style={styles.meanings}>
        {senses.map(sense => <Text key={sense} style={styles.meaning}>{sense}</Text>)}
        {card.note_ja && <Text style={styles.note}>{card.note_ja}</Text>}
      </View>
      <View style={styles.origin}>
        <View style={[styles.originDot, { backgroundColor: card.meaning_source === "glossary" ? THEME_COLORS.amber : THEME_COLORS.inkFaint }]} />
        <Text style={styles.originText}>{card.meaning_source === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）"}</Text>
      </View>
    </View>
  )
}

/**
 * 重ねたカードの束（後ろの 2 枚）。残りの枚数に合わせて出す枚数を減らす（残り 1 枚なら 1 枚、0 枚なら出さない）
 */
export function CardStackBehind({ count }: { count: number }) {
  const layers = STACK_LAYERS.slice(STACK_LAYERS.length - Math.min(Math.max(count, 0), STACK_LAYERS.length))
  return (
    <>
      {layers.map(layer => (
        <View key={layer.color} pointerEvents="none" style={[styles.stackLayer, { backgroundColor: layer.color, transform: layer.transform }]} />
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  backSentence: {
    color: THEME_COLORS.inkFaint,
    fontSize: 12.5,
    marginTop: 6,
    textAlign: "left",
  },
  face: {
    flex: 1,
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  fold: {
    borderColor: "rgba(153, 140, 118, 0.5)",
    borderStyle: "dashed",
    borderTopWidth: 1,
    marginVertical: 14,
  },
  frontBody: {
    flex: 1,
    gap: 22,
    justifyContent: "center",
  },
  frontSentence: {
    color: THEME_COLORS.inkMuted,
    fontSize: 15,
    textAlign: "center",
  },
  headingLarge: {
    alignItems: "center",
  },
  headingMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  headingSmall: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  hole: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.paperDeep,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    left: 16,
    position: "absolute",
    top: 16,
    width: 24,
    zIndex: 1,
  },
  holeInner: {
    backgroundColor: THEME_COLORS.canvas,
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  lemma: {
    color: THEME_COLORS.inkMuted,
    fontFamily: THEME_FONTS.reading,
    fontSize: 13,
  },
  meaning: {
    color: THEME_COLORS.ink,
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 26,
  },
  meanings: {
    flex: 1,
    gap: 4,
  },
  newStamp: {
    borderColor: "rgba(148, 96, 15, 0.5)",
    borderRadius: 4,
    borderWidth: 1,
    color: THEME_COLORS.inkAmber,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    position: "absolute",
    right: 16,
    top: 16,
    transform: [{ rotate: "2deg" }],
  },
  note: {
    borderColor: "rgba(148, 96, 15, 0.4)",
    borderLeftWidth: 2,
    color: THEME_COLORS.inkMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    paddingLeft: 10,
  },
  origin: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  originDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  originText: {
    color: THEME_COLORS.inkMuted,
    fontSize: 11,
  },
  partOfSpeech: {
    borderColor: "rgba(153, 140, 118, 0.6)",
    borderRadius: 999,
    borderWidth: 1,
    color: THEME_COLORS.inkMuted,
    fontSize: 11,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  sheet: {
    borderRadius: 12,
    elevation: 8,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  source: {
    color: THEME_COLORS.inkFaint,
    fontFamily: THEME_FONTS.reading,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 12,
    textAlign: "center",
  },
  stackLayer: {
    borderRadius: 12,
    bottom: 0,
    elevation: 4,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: "#000000",
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    top: 0,
  },
  surfaceLarge: {
    color: THEME_COLORS.ink,
    fontFamily: THEME_FONTS.readingSemiBold,
    fontSize: 30,
    lineHeight: 38,
    textAlign: "center",
  },
  surfaceSmall: {
    color: THEME_COLORS.ink,
    fontFamily: THEME_FONTS.readingSemiBold,
    fontSize: 17,
  },
})
