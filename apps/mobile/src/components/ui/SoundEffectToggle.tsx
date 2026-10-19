import { Ionicons } from "@expo/vector-icons"
import { Pressable, type StyleProp, type ViewStyle } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 効果音のオン / オフ。アイコンだけなので、読み上げには押すと何が起きるかを伝える
 */
export function SoundEffectToggle({
  isEnabled,
  style,
  onToggle,
}: {
  isEnabled: boolean
  style?: StyleProp<ViewStyle>
  onToggle: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={isEnabled ? "効果音をオフにする" : "効果音をオンにする"}
      accessibilityRole="button"
      hitSlop={8}
      style={style}
      onPress={onToggle}
    >
      <Ionicons color={THEME_COLORS.fgMuted} name={isEnabled ? "volume-high-outline" : "volume-mute-outline"} size={20} />
    </Pressable>
  )
}
