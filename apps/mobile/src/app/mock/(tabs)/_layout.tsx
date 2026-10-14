import { Ionicons } from "@expo/vector-icons"
import { Tabs } from "expo-router"

import { MOCK_COLORS } from "@/const/mock-theme"

/**
 * モックのタブ（マイページ / 問題 / 単語帳 / 設定）
 */
export default function MockTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "transparent" },
        tabBarActiveTintColor: MOCK_COLORS.amber,
        tabBarInactiveTintColor: MOCK_COLORS.fgFaint,
        tabBarStyle: { backgroundColor: MOCK_COLORS.surface, borderTopColor: MOCK_COLORS.line },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="grid-outline" size={size} />, title: "マイページ" }}
      />
      <Tabs.Screen
        name="passages"
        options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="book-outline" size={size} />, title: "問題" }}
      />
      <Tabs.Screen
        name="vocabulary"
        options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="albums-outline" size={size} />, title: "単語帳" }}
      />
      <Tabs.Screen
        name="settings"
        options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="settings-outline" size={size} />, title: "設定" }}
      />
    </Tabs>
  )
}
