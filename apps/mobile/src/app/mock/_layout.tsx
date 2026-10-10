import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular"
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium"
import { Literata_400Regular } from "@expo-google-fonts/literata/400Regular"
import { Literata_600SemiBold } from "@expo-google-fonts/literata/600SemiBold"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { View } from "react-native"

import { MOCK_COLORS } from "@/const/mock-theme"

/**
 * デザインモック共通のレイアウト。英文とコードのフォントを読み込み、ダークテーマのスタックを作る
 */
export default function MockLayout() {
  const [isFontLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    Literata_400Regular,
    Literata_600SemiBold,
  })

  if (!isFontLoaded) return <View style={{ backgroundColor: MOCK_COLORS.canvas, flex: 1 }} />

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: MOCK_COLORS.canvas }, headerShown: false }}>
        <Stack.Screen name="passages/[id]" options={{ presentation: "modal" }} />
      </Stack>
    </>
  )
}
