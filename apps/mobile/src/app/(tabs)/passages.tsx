import { useFocusEffect } from "@react-navigation/native"
import { useRouter } from "expo-router"
import { useCallback, useRef, useState } from "react"
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DIFFICULTY_LABELS, DIFFICULTY_ORDER, type PassageSourceKind, SOURCE_KIND_LABELS, SOURCE_KIND_ORDER } from "@/components/features/passage/labels"
import { PassageListRow } from "@/components/features/passage/PassageListRow"
import { appStyles } from "@/components/ui/app-styles"
import { Chip } from "@/components/ui/Chip"
import { Segment } from "@/components/ui/Segment"
import { THEME_COLORS } from "@/const/design-theme"
import { EMPTY_PASSAGE_FILTER, type PassageFilterQuery } from "@/features/passage/passage-query"
import { passageApi } from "@/features/passage/passage.api"
import { usePassageList } from "@/features/passage/use-passage-list"

type KindOption = "all" | PassageSourceKind

const KIND_OPTIONS: { key: KindOption, label: string }[] = [
  { key: "all", label: "すべて" },
  ...SOURCE_KIND_ORDER.map(kind => ({ key: kind, label: SOURCE_KIND_LABELS[kind] })),
]

/**
 * 選んでいれば外し、選んでいなければ足す
 */
const toggleItem = <T, >(list: T[], item: T): T[] => (list.includes(item) ? list.filter(value => value !== item) : [...list, item])

function ItemSeparator() {
  return <View style={appStyles.divider} />
}

/**
 * 問題一覧（問題タブ）。絞り込みは画面の state で、変わったら 1 ページ目から取り直す
 */
export default function PassagesScreen() {
  const router = useRouter()
  const [filter, setFilter] = useState<PassageFilterQuery>(EMPTY_PASSAGE_FILTER)
  /**
   * 「ランダムに 1 問」で条件に合う問題が無かった。絞り込みを変えたら押せる状態に戻す
   */
  const [isRandomUnavailable, setIsRandomUnavailable] = useState(false)
  const [isPickingRandom, setIsPickingRandom] = useState(false)
  const { hasError, isLoading, isLoadingMore, isRefreshing, items, loadMore, refresh, tags, totalCount } = usePassageList(filter)

  /**
   * 解いて戻ったときに挑戦状況を更新する。最初のフォーカスは初回の取得と重なるので取り直さない
   */
  const isFirstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false
        return
      }
      refresh({ isSilent: true })
    }, [refresh]),
  )

  const updateFilter = (patch: Partial<PassageFilterQuery>) => {
    setFilter(current => ({ ...current, ...patch }))
    setIsRandomUnavailable(false)
  }

  const clearFilter = () => {
    setFilter(EMPTY_PASSAGE_FILTER)
    setIsRandomUnavailable(false)
  }

  const openPassage = useCallback((id: number) => router.push(`/passages/${id}`), [router])

  const pickRandom = async () => {
    setIsPickingRandom(true)
    try {
      const id = await passageApi.getRandom(filter)
      if (id === null) {
        setIsRandomUnavailable(true)
        return
      }
      openPassage(id)
    } catch (error) {
      console.warn("Failed to pick a random passage:", error)
      Alert.alert("問題を選べませんでした", "時間をおいて再度お試しください。")
    } finally {
      setIsPickingRandom(false)
    }
  }

  const isRandomDisabled = totalCount === 0 || isRandomUnavailable || isPickingRandom

  return (
    <SafeAreaView edges={["top"]} style={appStyles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>問題</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isPickingRandom, disabled: isRandomDisabled }}
          disabled={isRandomDisabled}
          onPress={pickRandom}
          style={({ pressed }) => [styles.randomButton, pressed && styles.randomButtonPressed, isRandomDisabled && styles.disabled]}
        >
          <Text style={styles.randomText}>ランダムに 1 問</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <Segment
            options={KIND_OPTIONS}
            value={filter.kind ?? "all"}
            onChange={kind => updateFilter({ kind: kind === "all" ? null : kind })}
          />
          <View style={styles.switchRow}>
            <Text style={appStyles.caption}>未挑戦のみ</Text>
            <Switch
              accessibilityLabel="未挑戦のみ"
              thumbColor={filter.unattemptedOnly ? THEME_COLORS.amberInk : THEME_COLORS.fg}
              trackColor={{ false: THEME_COLORS.heat0, true: THEME_COLORS.amber }}
              value={filter.unattemptedOnly}
              onValueChange={unattemptedOnly => updateFilter({ unattemptedOnly })}
            />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
          {DIFFICULTY_ORDER.map(level => (
            <Chip
              key={level}
              isActive={filter.difficulty.includes(level)}
              label={DIFFICULTY_LABELS[level]}
              onPress={() => updateFilter({ difficulty: toggleItem(filter.difficulty, level) })}
            />
          ))}
          {tags.length > 0 && <View style={styles.chipDivider} />}
          {tags.map(tag => (
            <Chip
              key={tag}
              isActive={filter.tag.includes(tag)}
              label={tag}
              onPress={() => updateFilter({ tag: toggleItem(filter.tag, tag) })}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={THEME_COLORS.amber} style={styles.loading} />
          ) : hasError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>問題を読み込めませんでした。</Text>
              <Pressable
                accessibilityRole="button"
                disabled={isRefreshing}
                onPress={() => refresh()}
                style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed, isRefreshing && styles.disabled]}
              >
                <Text style={styles.clearText}>再読み込み</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>条件に合う問題がありません</Text>
              <Text style={styles.emptyText}>絞り込みの条件を減らすと、ほかの問題が表示されます。</Text>
              <Pressable
                accessibilityRole="button"
                onPress={clearFilter}
                style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
              >
                <Text style={styles.clearText}>絞り込みを解除する</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={isLoadingMore ? <ActivityIndicator color={THEME_COLORS.amber} style={styles.loadingMore} /> : null}
        ListHeaderComponent={hasError && items.length === 0 ? null : <Text style={styles.count}>{totalCount} 問</Text>}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={item => String(item.id)}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl colors={[THEME_COLORS.amber]} refreshing={isRefreshing} tintColor={THEME_COLORS.amber} onRefresh={() => refresh()} />}
        renderItem={({ item }) => <PassageListRow passage={item} onPress={openPassage} />}
        style={isLoading && items.length > 0 ? styles.stale : null}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  chipDivider: {
    backgroundColor: THEME_COLORS.line,
    marginHorizontal: 4,
    width: 1,
  },
  chips: {
    gap: 6,
    paddingHorizontal: 16,
  },
  clearButton: {
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearButtonPressed: {
    backgroundColor: THEME_COLORS.raised,
  },
  clearText: {
    color: THEME_COLORS.fg,
    fontSize: 14,
  },
  count: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    paddingVertical: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  empty: {
    alignItems: "center",
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    marginTop: 12,
    padding: 28,
  },
  emptyText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  emptyTitle: {
    color: THEME_COLORS.fg,
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
    borderColor: THEME_COLORS.line,
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
  list: {
    paddingBottom: 80,
    paddingHorizontal: 16,
  },
  loading: {
    marginTop: 40,
  },
  loadingMore: {
    marginVertical: 16,
  },
  randomButton: {
    backgroundColor: THEME_COLORS.amber,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  randomButtonPressed: {
    backgroundColor: THEME_COLORS.amberBright,
  },
  randomText: {
    color: THEME_COLORS.amberInk,
    fontSize: 13,
    fontWeight: "700",
  },
  stale: {
    opacity: 0.6,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
})
