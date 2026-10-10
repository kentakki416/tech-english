import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { MOCK_COLORS } from "@/const/mock-theme"

/**
 * モック専用：画面の状態を切り替えるパネル
 *
 * 製品の UI ではないことが分かるよう破線の枠にし、普段は畳んで画面の隅に置く。
 */
export function MockStatePanel({
  bottom = 96,
  current,
  states,
}: {
  bottom?: number
  current: string
  states: { href: Href, key: string, label: string }[]
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const currentLabel = states.find(state => state.key === current)?.label ?? states[0]?.label

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom }]}>
      <View style={styles.panel}>
        <Pressable onPress={() => setIsOpen(value => !value)} style={styles.summary}>
          <Text style={styles.faint}>モック</Text>
          <Text style={styles.label}>{currentLabel}</Text>
          <Text style={styles.faint}>{isOpen ? "▾" : "▴"}</Text>
        </Pressable>
        {isOpen && (
          <View style={styles.list}>
            {states.map(state => (
              <Pressable
                key={state.key}
                onPress={() => {
                  setIsOpen(false)
                  router.replace(state.href)
                }}
                style={[styles.item, state.key === current && styles.itemActive]}
              >
                <Text style={[styles.itemText, state.key === current && styles.itemTextActive]}>{state.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setIsOpen(false)
                router.push("/mock")
              }}
              style={styles.item}
            >
              <Text style={styles.faint}>画面一覧</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  faint: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
  },
  item: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  itemActive: {
    backgroundColor: MOCK_COLORS.fg,
  },
  itemText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
  },
  itemTextActive: {
    color: MOCK_COLORS.canvas,
  },
  label: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
  },
  list: {
    borderColor: MOCK_COLORS.fgFaint,
    borderStyle: "dashed",
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 8,
  },
  panel: {
    backgroundColor: "rgba(18, 22, 31, 0.96)",
    borderColor: MOCK_COLORS.fgFaint,
    borderRadius: 10,
    borderStyle: "dashed",
    borderWidth: 1,
    maxWidth: 320,
  },
  summary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  wrapper: {
    left: 12,
    position: "absolute",
    right: 12,
  },
})
