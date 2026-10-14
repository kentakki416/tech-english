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
   * Storage のキー（passages/{passage_id}/{text_hash}/{block_index}-{part}.mp3。作り直しの依頼で本文の hash が前と同じときは
   * passages/{passage_id}/{text_hash}-r{確保の時刻のミリ秒}/{block_index}-{part}.mp3）。URL は api が組み立てる
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
   * 生成タスクが確保した時刻（確保のトークン）。generating の行と、ready のまま確保した行（voice の変更・admin の作り直し。
   * 作り直す間も前のマニフェストを返し続ける）が値を持つ。それ以外は null
   */
  generationStartedAt: Date | null
  lastError: string | null
  /**
   * 最後に成功した生成のマニフェスト。まだ成功していなければ null
   */
  manifest: PassageAudioManifest | null
  passageId: number
  /**
   * admin が「作り直す」を押した時刻（作り直しの依頼）。生成タスクが作り直しに成功すると null に戻る
   */
  regenerateRequestedAt: Date | null
  status: AudioStatus
  /**
   * manifest を作った本文のハッシュ（manifest が無い行は作ろうとした本文のハッシュ）
   */
  textHash: string
  voiceId: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 見出し語ごとの発音の音声（1 語 1 行。vocabulary-pronunciation README「必要な DB 設計」）。ユーザーに紐づかない
 */
export type WordAudio = {
  id: number
  /**
   * mp3 の保存キー（words/{textHash}.mp3）。ready なら必ずある。失敗しても前の値を残す（voice の変更で前の mp3 を消すため）
   */
  audioKey: string | null
  attemptCount: number
  /**
   * 最後に成功した生成の課金文字数（mp3 の 1 リクエスト分）
   */
  billedCharacters: number
  generatedAt: Date | null
  /**
   * 生成タスクが確保した時刻（確保のトークン）。generating の行と、ready のまま確保した行（voice の変更）が値を持つ
   */
  generationStartedAt: Date | null
  lastError: string | null
  /**
   * 正規化した見出し語（normalizeVocabularyLemma。vocabulary_cards.lemma と同じ）
   */
  lemma: string
  status: AudioStatus
  /**
   * voice_id と見出し語のハッシュ（保存キーに使う）。audioKey と同じく最後に成功した生成のもの
   */
  textHash: string | null
  voiceId: string
  createdAt: Date
  updatedAt: Date
}
