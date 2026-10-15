import { StyleSheet } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

export const appStyles = StyleSheet.create({
  card: {
    backgroundColor: THEME_COLORS.surface,
    borderColor: THEME_COLORS.line,
    borderRadius: 12,
    borderWidth: 1,
  },
  caption: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
  },
  divider: {
    backgroundColor: THEME_COLORS.line,
    height: StyleSheet.hairlineWidth,
  },
  /**
   * 画面の一番外側。背景はルートレイアウトに敷いた AppBackdrop を透かすので塗らない
   */
  screen: {
    flex: 1,
  },
  sectionTitle: {
    color: THEME_COLORS.fg,
    fontSize: 16,
    fontWeight: "600",
  },
})
