import { Ionicons } from "@expo/vector-icons"
import { Tabs } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { Platform } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * web 表示のタブの切り替え。web は react-native-screens が無効で、外したタブの画面が zIndex -1 で残る。
 * 画面は AppBackdrop を透かす（塗らない）ので、そのままでは外したタブが透けて重なる。fade にすると外したタブの不透明度が 0 になる。
 * iOS / Android は外したタブを外す（描かない）ので切り替えの動きを付けない
 */
const TAB_ANIMATION = Platform.OS === "web" ? "fade" : "none"

/**
 * タブ（マイページ / 問題 / 単語帳 / 設定）。各画面が自分の上部を持つので共通のヘッダーは出さない
 */
export default function TabLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          animation: TAB_ANIMATION,
          headerShown: false,
          sceneStyle: { backgroundColor: "transparent" },
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
          name="vocabulary"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="albums-outline" size={size} />, title: "単語帳" }}
        />
        <Tabs.Screen
          name="settings"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons color={color} name="settings-outline" size={size} />, title: "設定" }}
        />
      </Tabs>
    </>
  )
}
