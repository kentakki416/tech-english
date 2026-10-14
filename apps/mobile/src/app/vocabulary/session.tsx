import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { VocabularyCard } from "@/components/features/vocabulary/PaperCard"
import { SessionTopBar, VocabularySession } from "@/components/features/vocabulary/VocabularySession"
import { appStyles } from "@/components/ui/app-styles"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS } from "@/const/design-theme"
import { vocabularyApi } from "@/features/vocabulary/vocabulary.api"

type SessionState =
  | { kind: "error" }
  | { kind: "loading" }
  | { cards: VocabularyCard[], kind: "ready", nextDueDate: string | null }

/**
 * 単語帳の 1 回分（単語帳のタブの「はじめる」から開くスタックの全画面）。1 回分を取り、カードが無ければ次の復習の日も取る
 */
export default function VocabularySessionScreen() {
  const [state, setState] = useState<SessionState>({ kind: "loading" })

  const load = useCallback(async () => {
    try {
      const session = await vocabularyApi.getSession()
      const nextDueDate = session.cards.length === 0 ? (await vocabularyApi.getSummary()).next_due_date : null
      setState({ cards: session.cards, kind: "ready", nextDueDate })
    } catch (error) {
      console.warn("Failed to fetch vocabulary session:", error)
      setState({ kind: "error" })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 「もう 1 回」と再読み込み。読み込み中は VocabularySession を外すので、前の回の state は持ち越さない
   */
  const reload = () => {
    setState({ kind: "loading" })
    void load()
  }

  if (state.kind === "ready") {
    return <VocabularySession cards={state.cards} nextDueDate={state.nextDueDate} onRestart={reload} />
  }

  return (
    <SafeAreaView edges={["top"]} style={appStyles.screen}>
      <SessionTopBar answeredCount={0} total={0} />
      <View style={styles.center}>
        {state.kind === "loading" ? (
          <ActivityIndicator color={THEME_COLORS.amber} />
        ) : (
          <>
            <Text style={styles.message}>読み込めませんでした。</Text>
            <View style={styles.reload}>
              <SecondaryButton label="再読み込み" onPress={reload} />
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  message: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    textAlign: "center",
  },
  reload: {
    marginTop: 16,
    minWidth: 160,
  },
})
