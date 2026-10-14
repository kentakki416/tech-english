import { Pressable, StyleSheet, Text } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 副ボタン（枠だけ）。押している間は raised の塗り、無効の間は薄くする
 */
export function SecondaryButton({ isDisabled = false, label, onPress }: { isDisabled?: boolean, label: string, onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, isDisabled && styles.disabled]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    backgroundColor: THEME_COLORS.raised,
  },
  text: {
    color: THEME_COLORS.fg,
    fontSize: 15,
  },
})
