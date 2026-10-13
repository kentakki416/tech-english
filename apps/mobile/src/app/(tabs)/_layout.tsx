import { Ionicons } from "@expo/vector-icons"
import { Tabs } from "expo-router"
import { StatusBar } from "expo-status-bar"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * タブ（マイページ / 問題 / 設定）。各画面が自分の上部を持つので共通のヘッダーは出さない
 *
 * マイページ（`index`）と設定（`settings`）の中身は learning-record step5 で置き換える。
 * それまでのマイページは既存のメモの一覧で、メモの追加ボタンをヘッダーに置いているのでヘッダーを出す
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
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: THEME_COLORS.surface },
            headerTintColor: THEME_COLORS.fg,
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name="grid-outline" size={size} />,
            /**
             * メモの一覧が画面のタイトルを「メモ」に変えるので、タブの名前は固定する
             */
            tabBarLabel: "マイページ",
            title: "マイページ",
          }}
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
