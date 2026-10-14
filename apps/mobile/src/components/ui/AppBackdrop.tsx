import { StyleSheet, useWindowDimensions, View } from "react-native"
import Svg, { Circle, Defs, LinearGradient, Mask, Pattern, RadialGradient, Rect, Stop } from "react-native-svg"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 星（上半分に散らした小さな光の点）。位置は画面の幅・高さに対する割合、明るさは不透明度
 */
const STARS: { opacity: number, radius: number, x: number, y: number }[] = [
  { opacity: 0.32, radius: 1.2, x: 0.12, y: 0.1 },
  { opacity: 0.24, radius: 0.9, x: 0.78, y: 0.16 },
  { opacity: 0.2, radius: 0.9, x: 0.64, y: 0.06 },
  { opacity: 0.26, radius: 1.2, x: 0.91, y: 0.3 },
  { opacity: 0.16, radius: 0.9, x: 0.33, y: 0.24 },
  { opacity: 0.2, radius: 1.2, x: 0.06, y: 0.38 },
  { opacity: 0.18, radius: 0.9, x: 0.47, y: 0.14 },
]

/**
 * ドットの方眼の間隔（web と同じ 24px）
 */
const DOT_GRID_SIZE = 24

/**
 * ページの背景（夜の部屋に読書灯がともっている）。web の `globals.css` の `.app-backdrop` と同じ構成
 *
 * 下から順に、上ほど明るい下地・周辺減光・夜の色（右下に青、左下に紫）・読書灯（上の中央から琥珀の光）・
 * ドットの方眼（下ほど消す）・星を重ねる。画面に固定して、スクロールしても動かない。
 * 操作は受けない（pointerEvents="none"）ので、画面の一番後ろに置く
 */
export function AppBackdrop() {
  const { height, width } = useWindowDimensions()

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height={height} width={width}>
        <Defs>
          <LinearGradient id="base" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#171c28" />
            <Stop offset="0.55" stopColor={THEME_COLORS.canvas} />
            <Stop offset="1" stopColor="#0e1118" />
          </LinearGradient>
          <RadialGradient cx="50%" cy="50%" id="vignette" r="75%">
            <Stop offset="0.4" stopColor="#000000" stopOpacity="0" />
            <Stop offset="0.78" stopColor="#000000" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.38" />
          </RadialGradient>
          <RadialGradient cx="100%" cy="100%" id="night-blue" rx="95%" ry="45%">
            <Stop offset="0" stopColor="#4c70d6" stopOpacity="0.2" />
            <Stop offset="0.6" stopColor="#4c70d6" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="0%" cy="100%" id="night-violet" rx="90%" ry="40%">
            <Stop offset="0" stopColor="#9a70e8" stopOpacity="0.12" />
            <Stop offset="0.6" stopColor="#9a70e8" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="50%" cy="-6%" id="lamp" rx="95%" ry="34%">
            <Stop offset="0" stopColor={THEME_COLORS.amber} stopOpacity="0.18" />
            <Stop offset="0.62" stopColor={THEME_COLORS.amber} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="50%" cy="0%" id="spotlight" rx="80%" ry="40%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.05" />
            <Stop offset="0.65" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
          <Pattern height={DOT_GRID_SIZE} id="dots" patternUnits="userSpaceOnUse" width={DOT_GRID_SIZE}>
            <Circle cx="1" cy="1" fill="#ffffff" fillOpacity="0.085" r="1" />
          </Pattern>
          <LinearGradient id="dots-fade" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="0.45" stopColor="#ffffff" stopOpacity="0.5" />
            <Stop offset="0.8" stopColor="#ffffff" stopOpacity="0" />
          </LinearGradient>
          <Mask height={height} id="dots-mask" width={width} x="0" y="0">
            <Rect fill="url(#dots-fade)" height={height} width={width} />
          </Mask>
        </Defs>
        <Rect fill="url(#base)" height={height} width={width} />
        <Rect fill="url(#vignette)" height={height} width={width} />
        <Rect fill="url(#night-violet)" height={height} width={width} />
        <Rect fill="url(#night-blue)" height={height} width={width} />
        <Rect fill="url(#spotlight)" height={height} width={width} />
        <Rect fill="url(#lamp)" height={height} width={width} />
        <Rect fill="url(#dots)" height={height} mask="url(#dots-mask)" width={width} />
        {STARS.map(star => (
          <Circle
            key={`${star.x}-${star.y}`}
            cx={star.x * width}
            cy={star.y * height}
            fill="#ffffff"
            fillOpacity={star.opacity}
            r={star.radius}
          />
        ))}
      </Svg>
    </View>
  )
}
