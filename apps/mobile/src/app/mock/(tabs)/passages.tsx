import { useLocalSearchParams, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { Chip, DifficultyMeter, mockStyles, ScoreSquares, Segment, SourceMeta } from "@/components/mock/parts"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import { DIFFICULTY_LABELS, formatSeconds, MOCK_PASSAGE_LIST, type MockDifficulty, type MockSourceKind } from "@/libs/mock-data"

type KindFilter = "all" | MockSourceKind

const ALL_TAGS = Array.from(new Set(MOCK_PASSAGE_LIST.flatMap(passage => passage.tags))).sort()

/**
 * 問題一覧（モック）
 */
export default function MockPassagesScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const isNoResults = params.state === "no-results"

  const [kind, setKind] = useState<KindFilter>("all")
  const [difficulties, setDifficulties] = useState<MockDifficulty[]>(isNoResults ? [3] : [])
  const [tags, setTags] = useState<string[]>(isNoResults ? ["python"] : [])
  const [isUnattemptedOnly, setIsUnattemptedOnly] = useState(false)

  const passages = useMemo(
    () => MOCK_PASSAGE_LIST.filter(passage =>
      (kind === "all" || passage.kind === kind)
      && (difficulties.length === 0 || difficulties.includes(passage.difficulty))
      && (tags.length === 0 || passage.tags.some(tag => tags.includes(tag)))
      && (!isUnattemptedOnly || passage.attemptCount === 0)),
    [difficulties, isUnattemptedOnly, kind, tags],
  )

  const toggle = <T, >(list: T[], item: T): T[] => (list.includes(item) ? list.filter(value => value !== item) : [...list, item])

  return (
    <SafeAreaView edges={["top"]} style={mockStyles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>問題</Text>
        <Pressable onPress={() => router.push("/mock/passages/57")} style={styles.randomButton}>
          <Text style={styles.randomText}>ランダムに 1 問</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <Segment
            onChange={setKind}
            options={[{ key: "all", label: "すべて" }, { key: "github", label: "GitHub" }, { key: "docs", label: "Docs" }]}
            value={kind}
          />
          <View style={styles.switchRow}>
            <Text style={mockStyles.caption}>未挑戦のみ</Text>
            <Switch
              onValueChange={setIsUnattemptedOnly}
              thumbColor={isUnattemptedOnly ? MOCK_COLORS.amberInk : MOCK_COLORS.fg}
              trackColor={{ false: MOCK_COLORS.heat0, true: MOCK_COLORS.amber }}
              value={isUnattemptedOnly}
            />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
          {([1, 2, 3] as const).map(level => (
            <Chip key={level} isActive={difficulties.includes(level)} label={DIFFICULTY_LABELS[level]} onPress={() => setDifficulties(value => toggle(value, level))} />
          ))}
          <View style={styles.chipDivider} />
          {ALL_TAGS.map(tag => <Chip key={tag} isActive={tags.includes(tag)} label={tag} onPress={() => setTags(value => toggle(value, tag))} />)}
        </ScrollView>
      </View>

      <FlatList
        ItemSeparatorComponent={() => <View style={mockStyles.divider} />}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>条件に合う問題がありません</Text>
            <Text style={styles.emptyText}>絞り込みの条件を減らすと、ほかの問題が表示されます。</Text>
            <Pressable
              onPress={() => {
                setKind("all")
                setDifficulties([])
                setTags([])
                setIsUnattemptedOnly(false)
              }}
              style={styles.clearButton}
            >
              <Text style={styles.clearText}>絞り込みを解除する</Text>
            </Pressable>
          </View>
        )}
        ListHeaderComponent={<Text style={styles.count}>{passages.length} 問</Text>}
        contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 16 }}
        data={passages}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(item.inProgress ? `/mock/passages/${item.id}?state=resume` : `/mock/passages/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: MOCK_COLORS.surface }]}
          >
            <Text numberOfLines={2} style={styles.rowTitle}>{item.title}</Text>
            <View style={{ marginTop: 6 }}><SourceMeta kind={item.kind} name={item.sourceName} /></View>
            <View style={styles.rowMeta}>
              <DifficultyMeter level={item.difficulty} />
              <Text style={styles.metaText}>{item.wordCount} 語</Text>
              <Text style={styles.metaText}>{formatSeconds(item.timeLimitSeconds)}</Text>
              <View style={{ marginLeft: "auto" }}>
                {item.inProgress ? (
                  <Text style={styles.inProgress}>挑戦中</Text>
                ) : item.bestCorrect === null ? (
                  <Text style={styles.unattempted}>未挑戦</Text>
                ) : (
                  <View style={styles.best}>
                    <ScoreSquares results={Array.from({ length: item.questionCount }, (_, index) => index < (item.bestCorrect ?? 0))} />
                    <Text style={styles.metaText}>{item.bestCorrect}/{item.questionCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
      />

      <MockStatePanel
        bottom={12}
        current={isNoResults ? "no-results" : "normal"}
        states={[
          { href: "/mock/passages", key: "normal", label: "通常" },
          { href: "/mock/passages?state=no-results", key: "no-results", label: "絞り込み結果が 0 件" },
        ]}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  best: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  chipDivider: {
    backgroundColor: MOCK_COLORS.line,
    marginHorizontal: 4,
    width: 1,
  },
  chips: {
    gap: 6,
    paddingHorizontal: 16,
  },
  clearButton: {
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearText: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
  },
  count: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
    paddingVertical: 10,
  },
  empty: {
    alignItems: "center",
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    marginTop: 12,
    padding: 28,
  },
  emptyText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  emptyTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
    fontWeight: "500",
  },
  filterRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  filters: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: MOCK_COLORS.line,
    gap: 12,
    paddingBottom: 14,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 56,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  inProgress: {
    borderColor: "rgba(243, 178, 76, 0.5)",
    borderRadius: 4,
    borderWidth: 1,
    color: MOCK_COLORS.amber,
    fontSize: 12,
    paddingHorizontal: 6,
  },
  metaText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
  },
  randomButton: {
    backgroundColor: MOCK_COLORS.amber,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  randomText: {
    color: MOCK_COLORS.amberInk,
    fontSize: 13,
    fontWeight: "700",
  },
  row: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  rowTitle: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 18,
    lineHeight: 24,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  title: {
    color: MOCK_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
  unattempted: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
  },
})
