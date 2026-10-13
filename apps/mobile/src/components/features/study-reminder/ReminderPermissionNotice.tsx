import { Ionicons } from "@expo/vector-icons"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * リマインダーがオンなのに通知が許可されていないときの案内（カード上部の淡い琥珀の帯）
 */
export function ReminderPermissionNotice({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <View style={styles.permission}>
      <Ionicons color={THEME_COLORS.amber} name="notifications-off-outline" size={18} />
      <View style={styles.flex}>
        <Text style={styles.permissionTitle}>通知が許可されていません</Text>
        <Text style={styles.permissionText}>リマインダーを受け取るには、OS の設定でこのアプリの通知を許可してください。</Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.permissionButton, pressed && styles.permissionButtonPressed]}
          onPress={onOpenSettings}
        >
          <Text style={styles.permissionButtonText}>設定を開く</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  permission: {
    backgroundColor: THEME_COLORS.amberWash,
    borderBottomWidth: 1,
    borderColor: "rgba(243, 178, 76, 0.3)",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  permissionButton: {
    alignSelf: "flex-start",
    backgroundColor: THEME_COLORS.amber,
    borderRadius: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  permissionButtonPressed: {
    backgroundColor: THEME_COLORS.amberBright,
  },
  permissionButtonText: {
    color: THEME_COLORS.amberInk,
    fontSize: 13,
    fontWeight: "700",
  },
  permissionText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  permissionTitle: {
    color: THEME_COLORS.fg,
    fontSize: 14,
    fontWeight: "500",
  },
})
