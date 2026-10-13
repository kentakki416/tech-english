import { Pressable, StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * セグメント（選択中だけ raised の塗り）
 */
export function Segment<T extends string>({ options, value, onChange }: { options: { key: T, label: string }[], value: T, onChange: (value: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map(option => (
        <Pressable
          key={option.key}
          accessibilityRole="button"
          accessibilityState={{ selected: option.key === value }}
          onPress={() => onChange(option.key)}
          style={[styles.item, option.key === value && styles.itemActive]}
        >
          <Text style={[styles.text, option.key === value && styles.textActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  item: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  itemActive: {
    backgroundColor: THEME_COLORS.raised,
  },
  segment: {
    borderColor: THEME_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 2,
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
  },
  textActive: {
    color: THEME_COLORS.fg,
  },
})
