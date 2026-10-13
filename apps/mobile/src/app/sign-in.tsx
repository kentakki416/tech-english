import { Ionicons } from "@expo/vector-icons"
import { StatusBar } from "expo-status-bar"
import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DEMO_BLOCKS, DEMO_DICTIONARY, DEMO_GLOSSARY } from "@/components/features/auth/sign-in-demo-data"
import { PassageReader, WordCard, type WordCardContent } from "@/components/features/passage/PassageReader"
import { appStyles } from "@/components/ui/app-styles"
import { Wordmark } from "@/components/ui/Wordmark"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { signInAsDevUser, signInWithGitHub } from "@/features/auth/auth.session"

/**
 * 開発用のログインで使う seed 済みのユーザー（apps/web の `/api/dev/login` と同じ）
 */
const DEV_LOGIN_USERS = [
  { email: "alice@dev.local", name: "alice" },
  { email: "bob@dev.local", name: "bob" },
] as const

/**
 * ログイン。最初の画面で、単語の意味が出る体験をそのまま試せるようにする
 *
 * ログインに成功するとログイン状態が変わり、ルートレイアウトの Stack.Protected がタブへ移す（ここでは遷移しない）。
 */
export default function SignInScreen() {
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [peekBlock, setPeekBlock] = useState<number | null>(null)
  const [wordCard, setWordCard] = useState<WordCardContent | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isFailed, setIsFailed] = useState(false)

  const pressSignIn = async () => {
    setIsSigningIn(true)
    setIsFailed(false)
    const result = await signInWithGitHub()
    /** 成功したときはこの画面が外れるので、状態を戻すのは失敗・取り消しのときだけ */
    if (result === "signedIn") return
    setIsFailed(result === "failed")
    setIsSigningIn(false)
  }

  /**
   * 開発用のログイン（`__DEV__` のときだけ出す）。成功したときの扱いは GitHub と同じ
   */
  const pressDevSignIn = async (email: string) => {
    setIsSigningIn(true)
    setIsFailed(false)
    const result = await signInAsDevUser(email)
    if (result === "signedIn") return
    setIsFailed(true)
    setIsSigningIn(false)
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Wordmark />
        <Text style={styles.headline}>公式ドキュメントの{"\n"}英語で、毎日 1 問。</Text>
        <Text style={styles.lead}>GitHub の README や公式ドキュメントの実際の英文を読んで、4 択の設問に答える長文読解です。</Text>

        <View style={[appStyles.card, styles.demo]}>
          <View style={styles.demoHeader}>
            <Text style={styles.docsBadge}>Docs</Text>
            <Text style={appStyles.caption}>React 公式ドキュメント</Text>
          </View>
          <View style={{ paddingRight: 14, paddingTop: 14 }}>
            <PassageReader
              blocks={DEMO_BLOCKS}
              dictionary={DEMO_DICTIONARY}
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
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isSigningIn, disabled: isSigningIn }}
          disabled={isSigningIn}
          onPress={pressSignIn}
          style={({ pressed }) => [styles.githubButton, pressed && { opacity: 0.85 }, isSigningIn && { opacity: 0.6 }]}
        >
          <Ionicons color={THEME_COLORS.canvas} name="logo-github" size={20} />
          <Text style={styles.githubText}>GitHub でログイン</Text>
        </Pressable>
        {isFailed && (
          <Text accessibilityRole="alert" style={styles.error}>ログインに失敗しました。もう一度お試しください。</Text>
        )}
        <Text style={styles.footnote}>初回はアカウントが自動で作られます。GitHub のリポジトリにはアクセスしません。</Text>
        {__DEV__ && (
          <Text style={styles.devLogin}>
            Dev Login:{" "}
            {DEV_LOGIN_USERS.map((user, index) => (
              <Text key={user.email}>
                {index > 0 && " / "}
                <Text
                  accessibilityRole="link"
                  disabled={isSigningIn}
                  onPress={async () => pressDevSignIn(user.email)}
                  style={styles.devLoginLink}
                >
                  {user.name}
                </Text>
              </Text>
            ))}
          </Text>
        )}
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
    borderColor: THEME_COLORS.line,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  demoNote: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  devLogin: {
    color: THEME_COLORS.fgFaint,
    fontFamily: THEME_FONTS.code,
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
  devLoginLink: {
    color: THEME_COLORS.fgMuted,
    textDecorationLine: "underline",
  },
  docsBadge: {
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 4,
    borderWidth: 1,
    color: THEME_COLORS.amber,
    fontSize: 11,
    paddingHorizontal: 5,
  },
  error: {
    color: THEME_COLORS.wrong,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    textAlign: "center",
  },
  footer: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  footnote: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
    textAlign: "center",
  },
  githubButton: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.fg,
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    height: 50,
    justifyContent: "center",
  },
  githubText: {
    color: THEME_COLORS.canvas,
    fontSize: 16,
    fontWeight: "700",
  },
  headline: {
    color: THEME_COLORS.fg,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 40,
    marginTop: 28,
  },
  lead: {
    color: THEME_COLORS.fgMuted,
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
