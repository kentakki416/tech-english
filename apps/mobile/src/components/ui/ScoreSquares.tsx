import { useEffect, useRef } from "react"
import { Animated, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

function ScoreSquare({ delay, isAnimated, result, size }: { delay: number, isAnimated: boolean, result: boolean | null, size: number }) {
  const progress = useRef(new Animated.Value(isAnimated ? 0 : 1)).current

  useEffect(() => {
    if (!isAnimated) return
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(progress, { friction: 5, tension: 120, toValue: 1, useNativeDriver: true }),
    ]).start()
  }, [delay, isAnimated, progress])

  return (
    <Animated.View
      accessibilityLabel={result === null ? "未挑戦" : result ? "正解" : "不正解"}
      style={{
        backgroundColor: result === null ? THEME_COLORS.heat0 : result ? THEME_COLORS.correct : THEME_COLORS.wrongWash,
        borderColor: result === false ? THEME_COLORS.wrong : "transparent",
        borderRadius: size > 20 ? 6 : 2,
        borderWidth: result === false ? 1 : 0,
        height: size,
        opacity: progress,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        width: size,
      }}
    />
  )
}

/**
 * 設問ごとの正誤を並べたマス。結果画面では順に灯す（isAnimated）
 */
export function ScoreSquares({ isAnimated = false, results, size = 10 }: { isAnimated?: boolean, results: (boolean | null)[], size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: size > 20 ? 8 : 4 }}>
      {results.map((result, index) => (
        <ScoreSquare key={index} delay={180 + index * 140} isAnimated={isAnimated} result={result} size={size} />
      ))}
    </View>
  )
}
