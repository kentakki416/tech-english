import { Ionicons } from "@expo/vector-icons"
import * as Localization from "expo-localization"
import { useMemo, useState } from "react"
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"

import { appStyles } from "@/components/ui/app-styles"
import { THEME_COLORS } from "@/const/design-theme"

/**
 * `Intl.supportedValuesOf` が無い環境（Hermes の版による）の候補。web のモックの設定画面の候補と同じ
 */
const FALLBACK_TIMEZONES = ["Asia/Tokyo", "Asia/Seoul", "Asia/Singapore", "Europe/London", "America/Los_Angeles", "America/New_York"]

/**
 * タイムゾーンの候補。`Intl.supportedValuesOf("timeZone")` が使えればその一覧、使えなければ端末のタイムゾーンと
 * FALLBACK_TIMEZONES。現在の値が一覧に無ければ（UTC や別名）先頭に足す
 */
const listTimezoneCandidates = (current: string): string[] => {
  const zones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [Localization.getCalendars()[0]?.timeZone ?? null, ...FALLBACK_TIMEZONES].filter((zone): zone is string => zone !== null)
  const uniqueZones = Array.from(new Set(zones))
  return uniqueZones.includes(current) ? uniqueZones : [current, ...uniqueZones]
}

function ItemSeparator() {
  return <View style={appStyles.divider} />
}

/**
 * タイムゾーンの選択（RN の Modal の pageSheet。新しいルートは足さない）。上の入力欄で絞り込み、行を押すと onSelect。
 * 保存中は行を押せなくする
 */
export function TimezonePickerModal({
  currentTimezone,
  isSaving,
  isVisible,
  onClose,
  onSelect,
}: {
  currentTimezone: string
  isSaving: boolean
  isVisible: boolean
  onClose: () => void
  onSelect: (timezone: string) => void
}) {
  const [query, setQuery] = useState("")
  const candidates = useMemo(() => listTimezoneCandidates(currentTimezone), [currentTimezone])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredZones = normalizedQuery === "" ? candidates : candidates.filter(zone => zone.toLowerCase().includes(normalizedQuery))

  const close = () => {
    if (isSaving) return
    setQuery("")
    onClose()
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={isVisible} onRequestClose={close}>
      {/**
        * Modal は別のウィンドウに描かれるので、セーフエリアを測り直す
        */}
      <SafeAreaProvider>
        <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>タイムゾーン</Text>
            <Pressable accessibilityRole="button" disabled={isSaving} hitSlop={8} onPress={close}>
              <Text style={[styles.close, isSaving && styles.disabled]}>閉じる</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons color={THEME_COLORS.fgFaint} name="search" size={16} />
            <TextInput
              accessibilityLabel="タイムゾーンを絞り込む"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              placeholder="例：Tokyo"
              placeholderTextColor={THEME_COLORS.fgFaint}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {isSaving && <Text style={styles.saving}>保存しています…</Text>}
          <FlatList
            ItemSeparatorComponent={ItemSeparator}
            ListEmptyComponent={<Text style={styles.empty}>一致するタイムゾーンがありません。</Text>}
            contentContainerStyle={styles.list}
            data={filteredZones}
            keyExtractor={zone => zone}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving, selected: item === currentTimezone }}
                disabled={isSaving}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelect(item)}
              >
                <Text style={[styles.rowText, item === currentTimezone && styles.rowTextSelected]}>{item}</Text>
                {item === currentTimezone && <Ionicons color={THEME_COLORS.amber} name="checkmark" size={18} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

const styles = StyleSheet.create({
  close: {
    color: THEME_COLORS.amber,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
  empty: {
    color: THEME_COLORS.fgFaint,
    fontSize: 13,
    paddingVertical: 20,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 56,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  list: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    color: THEME_COLORS.fg,
    fontSize: 15,
  },
  rowTextSelected: {
    color: THEME_COLORS.amber,
  },
  saving: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  search: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.canvas,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: THEME_COLORS.fg,
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 17,
    fontWeight: "600",
  },
})
