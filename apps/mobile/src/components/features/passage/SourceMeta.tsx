import { StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

import { type PassageSourceKind, SOURCE_KIND_LABELS } from "./labels"

export function SourceMeta({ kind, name }: { kind: PassageSourceKind, name: string }) {
  return (
    <View style={styles.sourceMeta}>
      <Text style={[styles.kindBadge, kind === "github" ? styles.kindGithub : styles.kindDocs]}>{SOURCE_KIND_LABELS[kind]}</Text>
      <Text numberOfLines={1} style={styles.sourceName}>{name}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  kindBadge: {
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: "500",
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  kindDocs: {
    borderColor: "rgba(243, 178, 76, 0.4)",
    color: THEME_COLORS.amber,
  },
  kindGithub: {
    borderColor: THEME_COLORS.lineStrong,
    color: THEME_COLORS.fg,
  },
  sourceMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
  },
  sourceName: {
    color: THEME_COLORS.fgMuted,
    flexShrink: 1,
    fontSize: 13,
  },
})
