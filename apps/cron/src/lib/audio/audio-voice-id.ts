/**
 * TTS_PROVIDER=fake の voice_id の接頭辞
 */
const FAKE_VOICE_ID_PREFIX = "fake:"

/**
 * passage_audios.voice_id と text_hash に入れる voice。fake（無音の mp3）は `fake:<voice>`（例：`fake:Joanna`）にする。
 * Polly と同じ値にすると、fake で ready にした問題を polly に切り替えても voice も hash も同じで作り直されず、
 * 保存キーも同じなので CDN の長期キャッシュに無音の mp3 が残る。値を分けると voice が違う ready の行として確保され、hash も保存キーも変わる
 */
export const buildAudioVoiceId = (input: { provider: "fake" | "polly"; voiceId: string }): string =>
  (input.provider === "fake" ? `${FAKE_VOICE_ID_PREFIX}${input.voiceId}` : input.voiceId)
