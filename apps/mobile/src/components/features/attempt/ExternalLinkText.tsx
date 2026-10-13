import { Linking, type StyleProp, StyleSheet, Text, type TextStyle } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 文中の外部リンク（出典のページ・コミット・ライセンス）。OS のブラウザで開く。
 * 解答画面ではアプリを離れている間はタイマーが止まる（AppState が active でなくなるため）
 */
export function ExternalLinkText({ children, style, url }: { children: React.ReactNode, style?: StyleProp<TextStyle>, url: string }) {
  return (
    <Text
      accessibilityRole="link"
      style={[styles.link, style]}
      onPress={() => {
        Linking.openURL(url).catch((error: unknown) => console.warn("Failed to open url:", error))
      }}
    >
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  link: {
    textDecorationColor: THEME_COLORS.lineStrong,
    textDecorationLine: "underline",
  },
})
