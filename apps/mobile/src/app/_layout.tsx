import "react-native-reanimated"

import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular"
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium"
import { Literata_400Regular } from "@expo-google-fonts/literata/400Regular"
import { Literata_600SemiBold } from "@expo-google-fonts/literata/600SemiBold"
import { DarkTheme, ThemeProvider } from "@react-navigation/native"
import { useFonts } from "expo-font"
import * as Notifications from "expo-notifications"
import { Stack } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import { StyleSheet } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import Header from "@/components/layout/Header"
import { AppBackdrop } from "@/components/ui/AppBackdrop"
import { THEME_COLORS } from "@/const/design-theme"
import { restoreSession } from "@/features/auth/auth.session"
import { useAuthStore } from "@/features/auth/auth.store"
import { useNotificationRedirect } from "@/hooks/use-notification-redirect"
import { useStudyReminderSync } from "@/hooks/use-study-reminder-sync"

/**
 * app が前面にいるときも通知を出す。iOS はバナーで出る。Android は shouldPlaySound: false で音・振動の無い通知になり、
 * 通知チャンネルの重要度も既定のため、ヘッドアップ（画面上部の表示）にはならず通知領域に入るだけ
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * ナビゲーションの背景を透明にして、後ろに敷いた共通の背景（AppBackdrop）を見せる。MVP はダークテーマのみ
 */
const NAVIGATION_THEME = { ...DarkTheme, colors: { ...DarkTheme.colors, background: "transparent" } }

/**
 * 下から出るモーダルは下の画面が透けないよう塗る（中に AppBackdrop を敷く）
 */
const MODAL_CONTENT_STYLE = { backgroundColor: THEME_COLORS.canvas }

/**
 * フォントとログイン状態が揃うまでスプラッシュを出したままにする
 */
void SplashScreen.preventAutoHideAsync()

export const unstable_settings = {
  anchor: "(tabs)",
}

/**
 * リマインダーの予約の同期と、通知のタップの遷移。
 * Stack より後に置き、ナビゲーションの準備ができてから遷移させる（エフェクトは前の兄弟から順に実行される）
 */
function StudyReminderEffects() {
  useStudyReminderSync()
  useNotificationRedirect()
  return null
}

export default function RootLayout() {
  const status = useAuthStore((state) => state.status)
  const [isFontLoaded, fontError] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    Literata_400Regular,
    Literata_600SemiBold,
  })
  /**
   * フォントの読み込みに失敗したときもスプラッシュを閉じる（システムのフォントで描画する）。
   * 失敗を待ち続けると、スプラッシュのまま先に進めなくなるため
   */
  const isReady = (isFontLoaded || fontError !== null) && status !== "loading"

  useEffect(() => {
    void restoreSession()
  }, [])

  useEffect(() => {
    if (isReady) void SplashScreen.hideAsync()
  }, [isReady])

  if (!isReady) return null

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppBackdrop />
      <ThemeProvider value={NAVIGATION_THEME}>
        <Stack
          screenOptions={{
            header: ({ navigation, options, back }) => (
              <Header navigation={navigation} options={options} back={back} />
            ),
            contentStyle: { backgroundColor: "transparent" }
          }}
        >
          {/**
            * ログイン中だけ開ける画面。ログイン状態が変わると expo-router が開ける画面へ自動で移る
            */}
          <Stack.Protected guard={status === "signedIn"}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="memo/new" options={{ title: "新規作成" }} />
            <Stack.Screen name="memo/[id]" options={{ title: "編集" }} />
            <Stack.Screen name="modal" options={{ contentStyle: MODAL_CONTENT_STYLE }} />
            {/**
              * 開始確認は下から出るモーダル（閉じるボタンを画面が持つ）。解答・結果は上部バーを画面が持つ
              */}
            <Stack.Screen name="passages/[id]" options={{ contentStyle: MODAL_CONTENT_STYLE, headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="passages/random" options={{ contentStyle: MODAL_CONTENT_STYLE, headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="attempts/[id]/index" options={{ headerShown: false }} />
            <Stack.Screen name="attempts/[id]/result" options={{ headerShown: false }} />
            {/**
              * 学習履歴（マイページの「すべて見る」）。上部バーを画面が持つ
              */}
            <Stack.Screen name="history" options={{ headerShown: false }} />
            {/**
              * 単語帳の 1 回分（単語帳のタブの「はじめる」）。上部バーを画面が持つ
              */}
            <Stack.Screen name="vocabulary/session" options={{ headerShown: false }} />
            {/**
              * アカウント削除の確認（設定タブの「危険な操作」）。上部バーを画面が持つ
              */}
            <Stack.Screen name="settings/delete-account" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={status === "signedOut"}>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          </Stack.Protected>
          {/**
            * デザインモック（design-mock skill）。独自のヘッダーを持つので既存のヘッダーは出さない
            */}
          <Stack.Screen name="mock" options={{ headerShown: false }} />
        </Stack>
        <StudyReminderEffects />
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: THEME_COLORS.canvas,
    flex: 1,
  },
})
