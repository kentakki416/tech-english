import { AUDIO_STATUSES } from "../const/audio"
import type { AudioStatus } from "../types/audio"

/**
 * 読み上げの音声の状態の値かどうか
 */
export const isAudioStatus = (value: string): value is AudioStatus =>
  (AUDIO_STATUSES as readonly string[]).includes(value)
