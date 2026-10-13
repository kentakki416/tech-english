import { Pressable, StyleSheet, Text } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 主要ボタン（琥珀）。1 画面に 1 つ。押している間は amber-bright、無効の間は薄くする
 */
export function PrimaryButton({ isDisabled = false, label, onPress }: { isDisabled?: boolean, label: string, onPress?: () => void }) {
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
    backgroundColor: THEME_COLORS.amber,
    borderRadius: 10,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    backgroundColor: THEME_COLORS.amberBright,
  },
  text: {
    color: THEME_COLORS.amberInk,
    fontSize: 15,
    fontWeight: "700",
  },
})
