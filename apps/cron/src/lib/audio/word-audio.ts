import { createHash } from "node:crypto"

/**
 * 単語の発音の text_hash（voice と見出し語の SHA-256 の 16 進。vocabulary-pronunciation README「単語の音声の保存と配信」）。
 * voice が変わるとハッシュも保存キーも変わるので、CDN の長期キャッシュに前の voice の音声が残らない
 */
export const calculateWordTextHash = (input: { lemma: string; voiceId: string }): string =>
  createHash("sha256").update(`${input.voiceId}\n${input.lemma}`).digest("hex")

/**
 * 単語の発音の mp3 の保存キー。見出し語に空白や記号があっても URL に使えるよう、見出し語ではなくハッシュを使う
 */
export const buildWordAudioKey = (textHash: string): string => `words/${textHash}.mp3`
