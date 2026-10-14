import type { SynthesizeAudioResult, SynthesizeInput, SynthesizeResult, TtsClient } from "./tts-client"

/**
 * 無音の MPEG-1 Layer III のフレームのヘッダ（同期ビット・MPEG-1・Layer III・CRC なし / 32 kbps・32 kHz・パディングなし / モノラル）。
 * ヘッダの後ろを 0 で埋めた 144 バイト（144 × 32000 ÷ 32000）で 1 フレーム = 1152 サンプル = 36 ms。
 * サイド情報がすべて 0（main_data_begin = 0・part2_3_length = 0・global_gain = 0）なので、デコードすると無音になる
 * （ffmpeg〈Chrome / Firefox〉と CoreAudio〈Safari / iOS〉で再生できることを確かめてある）
 */
const SILENT_FRAME_HEADER = [0xff, 0xfb, 0x18, 0xc0]
const SILENT_FRAME_BYTES = 144
const SILENT_FRAME_MS = 36

/**
 * 1 単語あたりの長さ（ミリ秒。1 分あたり 200 語）
 */
const FAKE_MS_PER_WORD = 300

/**
 * 単語として時刻を付ける文字列（英数字と、語中のアポストロフィ・ハイフン）
 */
const FAKE_WORD_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g

/**
 * 無音のフレームを frameCount 個並べた mp3（ID3 タグも Xing ヘッダも無い CBR）
 */
const createSilentMp3 = (frameCount: number): Buffer => {
  const frame = Buffer.alloc(SILENT_FRAME_BYTES)
  frame.set(SILENT_FRAME_HEADER)
  return Buffer.concat(Array.from({ length: frameCount }, () => frame))
}

/**
 * ローカル（TTS_PROVIDER=fake）とテスト用の音声合成。外部に通信せず、同じ入力には同じ結果を返す。
 * 音声は単語の数 × 300 ms の無音の mp3、単語の時刻は音声の長さを単語の数で等分した開始時刻（start / end は Polly と同じく UTF-8 のバイト位置）。
 * synthesizeAudio（単語の発音）は同じ長さの無音の mp3 だけを返す。
 * 課金されないので recordBilledCharacters は呼ばない（月の上限の集計に数えない）
 */
export class FakeTtsClient implements TtsClient {
  public async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const words = [...input.text.matchAll(FAKE_WORD_PATTERN)]
    const frameCount = Math.max(1, Math.ceil((words.length * FAKE_MS_PER_WORD) / SILENT_FRAME_MS))
    const durationMs = frameCount * SILENT_FRAME_MS
    const marks = words.map((word, index) => {
      const start = Buffer.byteLength(input.text.slice(0, word.index))
      return {
        end: start + Buffer.byteLength(word[0]),
        start,
        time: Math.floor((index * durationMs) / words.length),
        value: word[0],
      }
    })
    return { audio: createSilentMp3(frameCount), billedCharacters: 0, marks }
  }

  public async synthesizeAudio(input: SynthesizeInput): Promise<SynthesizeAudioResult> {
    const { audio } = await this.synthesize(input)
    return { audio, billedCharacters: 0 }
  }
}

export const forTesting = {
  createSilentMp3,
  SILENT_FRAME_MS,
}
