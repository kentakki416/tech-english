import type { AUDIO_STATUSES } from "../const/audio"

/**
 * 読み上げの音声の状態
 */
export type AudioStatus = (typeof AUDIO_STATUSES)[number]

/**
 * 単語 1 つの時刻と位置。容量を抑えるためオブジェクトにせずタプルにする（600 語で約 20KB）。
 * offset は PassageBlock.text（バッククォートを含む元の本文）上の UTF-16 の index で、endOffset は含まない
 */
export type AudioWordTiming = [startMs: number, endMs: number, startOffset: number, endOffset: number]

/**
 * 1 回の音声合成で作った mp3。ふつうは 1 ブロック 1 パート。3,000 文字を超えるブロックだけ複数になる
 */
export type PassageAudioPart = {
  durationMs: number
  /**
   * Storage のキー（passages/{passage_id}/{text_hash}/{block_index}-{part}.mp3）。URL は api が組み立てる
   */
  key: string
  words: AudioWordTiming[]
}

/**
 * 問題の読み上げの音声のマニフェスト（passage_audios.manifest）
 */
export type PassageAudioManifest = {
  /**
   * 読み上げるブロックだけ（code のブロックは含まない）。blockIndex の昇順
   */
  blocks: { blockIndex: number; parts: PassageAudioPart[] }[]
}

/**
 * 問題ごとの読み上げの音声（1 問 1 行）
 */
export type PassageAudio = {
  id: number
  attemptCount: number
  /**
   * Polly の課金文字数（音声 + 単語の時刻）。最後に成功した生成の分
   */
  billedCharacters: number
  generatedAt: Date | null
  /**
   * generating にした時刻（確保のトークン）。generating 以外では null
   */
  generationStartedAt: Date | null
  lastError: string | null
  /**
   * 最後に成功した生成のマニフェスト。まだ成功していなければ null
   */
  manifest: PassageAudioManifest | null
  passageId: number
  status: AudioStatus
  /**
   * manifest を作った本文のハッシュ（manifest が無い行は作ろうとした本文のハッシュ）
   */
  textHash: string
  voiceId: string
  createdAt: Date
  updatedAt: Date
}
