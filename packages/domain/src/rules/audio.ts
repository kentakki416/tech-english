import { AUDIO_STATUSES } from "../const/audio"
import type { AudioStatus } from "../types/audio"

export const isAudioStatus = (value: string): value is AudioStatus =>
  (AUDIO_STATUSES as readonly string[]).includes(value)
