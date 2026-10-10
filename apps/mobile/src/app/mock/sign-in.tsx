import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { mockStyles, Wordmark } from "@/components/mock/parts"
import { PassageReader, WordCard, type WordCardContent } from "@/components/mock/PassageReader"
import { MOCK_COLORS } from "@/const/mock-theme"
import { MOCK_BLOCKS, MOCK_DICTIONARY, MOCK_GLOSSARY } from "@/libs/mock-data"

const DEMO_BLOCKS = [MOCK_BLOCKS[5]]

const DEMO_GLOSSARY = MOCK_GLOSSARY.filter(entry => entry.blockIndex === 5).map(entry => ({ ...entry, blockIndex: 0 }))

/**
 * ログイン（モック）。最初の画面で、単語の意味が出る体験をそのまま試せるようにする
 */
export default function MockSignInScreen() {
  const router = useRouter()
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [peekBlock, setPeekBlock] = useState<number | null>(null)
  const [wordCard, setWordCard] = useState<WordCardContent | null>(null)

  return (
    <SafeAreaView edges={["top", "bottom"]} style={mockStyles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Wordmark />
        <Text style={styles.headline}>公式ドキュメントの{"\n"}英語で、毎日 1 問。</Text>
        <Text style={styles.lead}>GitHub の README や公式ドキュメントの実際の英文を読んで、4 択の設問に答える長文読解です。</Text>

        <View style={[mockStyles.card, styles.demo]}>
          <View style={styles.demoHeader}>
            <Text style={styles.docsBadge}>Docs</Text>
            <Text style={mockStyles.caption}>React 公式ドキュメント</Text>
          </View>
          <View style={{ paddingRight: 14, paddingTop: 14 }}>
            <PassageReader
              blocks={DEMO_BLOCKS}
              dictionary={MOCK_DICTIONARY}
              fontSize={15}
              glossary={DEMO_GLOSSARY}
              peekBlock={peekBlock}
              translatedBlocks={translatedBlocks}
              onPeekEnd={() => setPeekBlock(null)}
              onPeekStart={setPeekBlock}
              onToggleTranslation={blockIndex => setTranslatedBlocks(value => (value.has(blockIndex) ? new Set() : new Set([blockIndex])))}
              onWordPress={setWordCard}
            />
          </View>
          <Text style={styles.demoNote}>単語をタップすると意味が出ます。段落を長押しすると、押している間だけ和訳になります。</Text>
        </View>
      </ScrollView>

      {wordCard && (
        <View style={styles.wordCardWrapper}>
          <WordCard content={wordCard} onClose={() => setWordCard(null)} />
        </View>
      )}

      <View style={styles.footer}>
        <Pressable onPress={() => router.replace("/mock/home")} style={({ pressed }) => [styles.githubButton, pressed && { opacity: 0.85 }]}>
          <Ionicons color={MOCK_COLORS.canvas} name="logo-github" size={20} />
          <Text style={styles.githubText}>GitHub でログイン</Text>
        </Pressable>
        <Text style={styles.footnote}>初回はアカウントが自動で作られます。GitHub のリポジトリにはアクセスしません。</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  demo: {
    marginTop: 24,
    overflow: "hidden",
  },
  demoHeader: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: MOCK_COLORS.line,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  demoNote: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  docsBadge: {
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 4,
    borderWidth: 1,
    color: MOCK_COLORS.amber,
    fontSize: 11,
    paddingHorizontal: 5,
  },
  footer: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  footnote: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
    textAlign: "center",
  },
  githubButton: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.fg,
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    height: 50,
    justifyContent: "center",
  },
  githubText: {
    color: MOCK_COLORS.canvas,
    fontSize: 16,
    fontWeight: "700",
  },
  headline: {
    color: MOCK_COLORS.fg,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 40,
    marginTop: 28,
  },
  lead: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 24,
    marginTop: 12,
  },
  wordCardWrapper: {
    bottom: 140,
    left: 12,
    position: "absolute",
    right: 12,
  },
})
