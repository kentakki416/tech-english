import "react-native-reanimated"

import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular"
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium"
import { Literata_400Regular } from "@expo-google-fonts/literata/400Regular"
import { Literata_600SemiBold } from "@expo-google-fonts/literata/600SemiBold"
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native"
import { useFonts } from "expo-font"
import * as Notifications from "expo-notifications"
import { Stack } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import Header from "@/components/layout/Header"
import { COLORS } from "@/const/color"
import { restoreSession } from "@/features/auth/auth.session"
import { useAuthStore } from "@/features/auth/auth.store"
import { useColorScheme } from "@/hooks/use-color-scheme"

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  })
})

/**
 * フォントとログイン状態が揃うまでスプラッシュを出したままにする
 */
void SplashScreen.preventAutoHideAsync()

export const unstable_settings = {
  anchor: "(tabs)",
}

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const status = useAuthStore((state) => state.status)
  const [isFontLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    Literata_400Regular,
    Literata_600SemiBold,
  })
  const isReady = isFontLoaded && status !== "loading"

  useEffect(() => {
    void restoreSession()
  }, [])

  useEffect(() => {
    if (isReady) void SplashScreen.hideAsync()
  }, [isReady])

  if (!isReady) return null

  return (
    <GestureHandlerRootView>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            header: ({ navigation, options, back }) => (
              <Header navigation={navigation} options={options} back={back} />
            ),
            contentStyle: { backgroundColor: COLORS.background }
          }}
        >
          {/**
            * ログイン中だけ開ける画面。ログイン状態が変わると expo-router が開ける画面へ自動で移る
            */}
          <Stack.Protected guard={status === "signedIn"}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="memo/new" options={{ title: "新規作成" }} />
            <Stack.Screen name="memo/[id]" options={{ title: "編集" }} />
            <Stack.Screen name="modal" />
            {/**
              * 開始確認は下から出るモーダル（閉じるボタンを画面が持つ）。解答・結果は上部バーを画面が持つ
              */}
            <Stack.Screen name="passages/[id]" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="passages/random" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="attempts/[id]/index" options={{ headerShown: false }} />
            <Stack.Screen name="attempts/[id]/result" options={{ headerShown: false }} />
            {/**
              * 学習履歴（マイページの「すべて見る」）。上部バーを画面が持つ
              */}
            <Stack.Screen name="history" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={status === "signedOut"}>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          </Stack.Protected>
          {/**
            * デザインモック（design-mock skill）。独自のヘッダーを持つので既存のヘッダーは出さない
            */}
          <Stack.Screen name="mock" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
