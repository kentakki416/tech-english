import { StyleSheet, Text } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

export function SourceMeta({ name }: { name: string }) {
  return <Text numberOfLines={1} style={styles.sourceName}>{name}</Text>
}

const styles = StyleSheet.create({
  sourceName: {
    color: THEME_COLORS.fgMuted,
    flexShrink: 1,
    fontSize: 13,
  },
})
