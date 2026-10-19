import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * 効果音のオン / オフ（web は localStorage の同じキー）。単語帳と解答画面で共通。アカウント削除の AsyncStorage.clear() で一緒に消える。
 * 単語帳だけにあったときの名前のまま。変えると、単語帳でオフにしている人の設定が消えるため
 */
const SOUND_EFFECT_STORAGE_KEY = "tech-english:vocabulary-sound"

const listeners = new Set<() => void>()

/**
 * 画面をまたいで 1 つだけ持つ（画面ごとに持つと、両方が開いているときに片方の切り替えがもう片方に効かない）
 */
let isEnabled = true

/**
 * AsyncStorage を読みに行くのは、最初に購読されたときの 1 回だけ
 */
let loading: Promise<void> | null = null

const notifyListeners = () => {
  for (const listener of listeners) listener()
}

const loadSetting = () => {
  loading ??= AsyncStorage.getItem(SOUND_EFFECT_STORAGE_KEY)
    .then((stored) => {
      if (stored !== "off") return
      isEnabled = false
      notifyListeners()
    })
    .catch((error: unknown) => console.warn("Failed to read sound effect setting:", error))
}

export const subscribeSoundEffectSetting = (listener: () => void) => {
  loadSetting()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const readSoundEffectSetting = (): boolean => isEnabled

/**
 * 保存に失敗しても、開いている画面では切り替えた設定で鳴らす
 */
export const toggleSoundEffectSetting = () => {
  isEnabled = !isEnabled
  notifyListeners()
  void AsyncStorage.setItem(SOUND_EFFECT_STORAGE_KEY, isEnabled ? "on" : "off")
    .catch((error: unknown) => console.warn("Failed to save sound effect setting:", error))
}
