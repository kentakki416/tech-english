import { Pressable, StyleSheet, Text } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 設問の「訳」。見た目は段落の「訳」と同じで、段落と違い薄くしない（設問は 1 つずつしか見えず、置き場所を探させないため）
 */
export function QuestionTranslationToggle({
  isTranslated,
  onToggle,
}: {
  isTranslated: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={isTranslated ? "設問の和訳を隠す" : "設問の和訳を表示"}
      accessibilityRole="button"
      accessibilityState={{ selected: isTranslated }}
      hitSlop={8}
      style={[styles.button, isTranslated && styles.buttonActive]}
      onPress={onToggle}
    >
      <Text style={[styles.text, isTranslated && styles.textActive]}>訳</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  buttonActive: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.5)",
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 11,
  },
  textActive: {
    color: THEME_COLORS.amber,
  },
})
