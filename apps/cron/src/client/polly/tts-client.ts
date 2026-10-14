import type { SpeechMark } from "../../lib/audio"

export type SynthesizeInput = {
  /**
   * 課金された文字数を記録する（月の上限の集計用）。課金されるリクエスト（Polly の音声と単語の時刻）が成功するたびに、その文字数で呼ぶ。
   * 片方だけが成功して失敗に終わるときも、成功した方の分を記録してから throw する。課金されない FakeTtsClient は呼ばない
   */
  recordBilledCharacters: (characters: number) => Promise<void>
  /**
   * 読み上げ用テキスト（POLLY_MAX_BILLED_CHARACTERS 以下）
   */
  text: string
  voiceId: string
}

export type SynthesizeResult = {
  /**
   * mp3
   */
  audio: Buffer
  /**
   * 音声と単語の時刻の 2 リクエストの課金文字数の合計
   */
  billedCharacters: number
  /**
   * 単語の時刻。start / end は input.text の UTF-8 のバイト位置
   */
  marks: SpeechMark[]
}

/**
 * 音声合成のクライアント。service はこの interface だけを知る（本番は PollyTtsClient、ローカルとテストは FakeTtsClient）
 */
export interface TtsClient {
  /**
   * SDK が throw したエラー（リトライ後の throttling / 5xx、資格情報・権限の誤りなど）と、recordBilledCharacters のエラーはそのまま伝播する
   */
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>
}
