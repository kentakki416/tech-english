import { Fragment } from "react"
import { type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import type { MockVocabularyCard } from "@/libs/mock-data"

import { type MockPronunciation, SentenceSoundButton, WordSoundButton } from "./PronunciationButtons"

/**
 * インラインコード（改行を含まない、対になったバッククォート）
 */
const INLINE_CODE_PATTERN = /(`[^`\n]+`)/

/**
 * 束の後ろの 2 枚。手前のカードと合わせて 3 枚に見えるよう、1 枚ごとに下へずらし、横にも少しずらして傾ける（web と同じ）
 */
const STACK_LAYERS: { color: string, transform: ViewStyle["transform"] }[] = [
  { color: "#e1d4ba", transform: [{ translateX: -7 }, { translateY: 22 }, { rotate: "-2.2deg" }] },
  { color: "#ebdfc7", transform: [{ translateX: 5 }, { translateY: 11 }, { rotate: "1.4deg" }] },
]

/**
 * バッククォートのインラインコードを、紙の上のコードの見た目で描く（入れ子の Text）
 */
function InkText({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE_CODE_PATTERN).map((part, index) =>
        index % 2 === 1
          ? <Text key={index} style={styles.inlineCode}>{part.slice(1, -1)}</Text>
          : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  )
}

/**
 * 本文の 1 文。単語に蛍光ペンのような琥珀の塗りを付ける。1 文を再生している間は塗りを濃くする
 * （入れ子の Text は影を付けられず、ネイティブで動かせないため、web のように光らせずに色だけ変える）
 */
export function SentenceText({
  isPlaying = false,
  numberOfLines,
  sentence,
  style,
}: {
  isPlaying?: boolean
  numberOfLines?: number
  sentence: NonNullable<MockVocabularyCard["sentence"]>
  style?: StyleProp<TextStyle>
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.sentence, style]}>
      <InkText text={sentence.text.slice(0, sentence.highlightStart)} />
      <Text style={[styles.highlight, isPlaying && styles.highlightPlaying]}>
        <InkText text={sentence.text.slice(sentence.highlightStart, sentence.highlightEnd)} />
      </Text>
      <InkText text={sentence.text.slice(sentence.highlightEnd)} />
    </Text>
  )
}

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
            <Stop offset="0.45" stopColor={tone === "front" ? MOCK_COLORS.paper : "#ede1ca"} />
            <Stop offset="1" stopColor={MOCK_COLORS.paperDeep} />
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
 * 語句と、見出し語が違うときの見出し語・品詞。発音のボタンは語句のすぐ右。
 * 表は左にボタンと同じ幅の空きを置き、語句を中央に保ったまま長い語句を折り返せるようにする
 */
function WordHeading({ card, pronunciation, size }: { card: MockVocabularyCard, pronunciation?: MockPronunciation, size: "lg" | "sm" }) {
  const hasLemma = card.lemma !== card.surface.toLowerCase()
  if (size === "lg") {
    return (
      <View style={styles.headingLarge}>
        <View style={styles.surfaceRow}>
          {pronunciation && <View style={styles.surfaceSpacer} />}
          <Text style={styles.surfaceLarge}>{card.surface}</Text>
          {pronunciation && <WordSoundButton lemma={card.lemma} pronunciation={pronunciation} size="lg" />}
        </View>
        <View style={styles.headingMeta}>
          {hasLemma && <Text style={styles.lemma}>{card.lemma}</Text>}
          {card.partOfSpeech && <Text style={styles.partOfSpeech}>{card.partOfSpeech}</Text>}
        </View>
      </View>
    )
  }
  return (
    <View style={[styles.headingSmall, pronunciation && styles.headingSmallWithSound]}>
      <Text style={styles.surfaceSmall}>{card.surface}</Text>
      {pronunciation && <WordSoundButton lemma={card.lemma} pronunciation={pronunciation} size="sm" />}
      <View style={styles.headingMeta}>
        {hasLemma && <Text style={styles.lemma}>{card.lemma}</Text>}
        {card.partOfSpeech && <Text style={styles.partOfSpeech}>{card.partOfSpeech}</Text>}
      </View>
    </View>
  )
}

/**
 * カードの表。語句・本文の 1 文・出典。新しい単語には印を付ける
 */
export function PaperCardFront({ card, pronunciation }: { card: MockVocabularyCard, pronunciation?: MockPronunciation }) {
  return (
    <View style={styles.face}>
      {card.stage === null && <Text style={styles.newStamp}>新しい単語</Text>}
      <View style={styles.frontBody}>
        <WordHeading card={card} pronunciation={pronunciation} size="lg" />
        {card.sentence && (
          <View style={styles.frontSentenceBlock}>
            <SentenceText isPlaying={pronunciation?.playing === "sentence"} sentence={card.sentence} style={styles.frontSentence} />
            {pronunciation && <SentenceSoundButton align="center" pronunciation={pronunciation} />}
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={styles.source}>— {card.passageTitle} より</Text>
    </View>
  )
}

/**
 * カードの裏。表の語句と 1 文を小さく残し、意味・補足・出どころを出す
 */
export function PaperCardBack({ card, pronunciation }: { card: MockVocabularyCard, pronunciation?: MockPronunciation }) {
  const senses = card.meaningSource === "dictionary" ? card.meaningJa.split(" / ") : [card.meaningJa]
  return (
    <View style={styles.face}>
      <WordHeading card={card} pronunciation={pronunciation} size="sm" />
      {card.sentence && (
        <SentenceText isPlaying={pronunciation?.playing === "sentence"} numberOfLines={2} sentence={card.sentence} style={styles.backSentence} />
      )}
      {card.sentence && pronunciation && <View style={styles.backSentenceSound}><SentenceSoundButton align="start" pronunciation={pronunciation} /></View>}
      <View style={styles.fold} />
      <View accessibilityLiveRegion="polite" style={styles.meanings}>
        {senses.map(sense => <Text key={sense} style={styles.meaning}>{sense}</Text>)}
        {card.noteJa && <Text style={styles.note}>{card.noteJa}</Text>}
      </View>
      <View style={styles.origin}>
        <View style={[styles.originDot, { backgroundColor: card.meaningSource === "glossary" ? MOCK_COLORS.amber : MOCK_COLORS.inkFaint }]} />
        <Text style={styles.originText}>{card.meaningSource === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）"}</Text>
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
    color: MOCK_COLORS.inkFaint,
    fontSize: 12.5,
    marginTop: 6,
    textAlign: "left",
  },
  backSentenceSound: {
    marginTop: 4,
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
    color: MOCK_COLORS.inkMuted,
    fontSize: 15,
    textAlign: "center",
  },
  frontSentenceBlock: {
    gap: 8,
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
  headingSmallWithSound: {
    alignItems: "center",
    columnGap: 4,
  },
  highlight: {
    backgroundColor: "rgba(243, 178, 76, 0.45)",
    color: MOCK_COLORS.ink,
  },
  highlightPlaying: {
    backgroundColor: "rgba(243, 178, 76, 0.8)",
  },
  hole: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.paperDeep,
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
    backgroundColor: MOCK_COLORS.canvas,
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  inlineCode: {
    backgroundColor: "rgba(216, 201, 172, 0.6)",
    color: MOCK_COLORS.ink,
    fontFamily: MOCK_FONTS.code,
    fontSize: 13,
  },
  lemma: {
    color: MOCK_COLORS.inkMuted,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 13,
  },
  meaning: {
    color: MOCK_COLORS.ink,
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
    color: MOCK_COLORS.inkAmber,
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
    color: MOCK_COLORS.inkMuted,
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
    color: MOCK_COLORS.inkMuted,
    fontSize: 11,
  },
  partOfSpeech: {
    borderColor: "rgba(153, 140, 118, 0.6)",
    borderRadius: 999,
    borderWidth: 1,
    color: MOCK_COLORS.inkMuted,
    fontSize: 11,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  sentence: {
    fontFamily: MOCK_FONTS.reading,
    lineHeight: 24,
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
    color: MOCK_COLORS.inkFaint,
    fontFamily: MOCK_FONTS.reading,
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
    color: MOCK_COLORS.ink,
    flexShrink: 1,
    fontFamily: MOCK_FONTS.readingSemiBold,
    fontSize: 30,
    lineHeight: 38,
    textAlign: "center",
  },
  surfaceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  surfaceSmall: {
    color: MOCK_COLORS.ink,
    fontFamily: MOCK_FONTS.readingSemiBold,
    fontSize: 17,
  },
  /**
   * 発音のボタン（36）と同じ幅。語句を中央に保つ
   */
  surfaceSpacer: {
    width: 36,
  },
})
