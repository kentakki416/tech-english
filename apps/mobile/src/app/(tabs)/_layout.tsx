import { Ionicons } from "@expo/vector-icons"
import { Tabs } from "expo-router"
import { StatusBar } from "expo-status-bar"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * タブ（マイページ / 問題 / 設定）。各画面が自分の上部を持つので共通のヘッダーは出さない
 */
export default function TabLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: THEME_COLORS.canvas },
          tabBarActiveTintColor: THEME_COLORS.amber,
          tabBarInactiveTintColor: THEME_COLORS.fgFaint,
          tabBarStyle: { backgroundColor: THEME_COLORS.surface, borderTopColor: THEME_COLORS.line },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="grid-outline" size={size} />, title: "マイページ" }}
        />
        <Tabs.Screen
          name="passages"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="book-outline" size={size} />, title: "問題" }}
        />
        <Tabs.Screen
          name="settings"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="settings-outline" size={size} />, title: "設定" }}
        />
      </Tabs>
    </>
  )
}
