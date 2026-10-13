import {
  type PollyClient,
  SynthesizeSpeechCommand,
  type SynthesizeSpeechCommandOutput,
  VoiceId,
} from "@aws-sdk/client-polly"

import { parseSpeechMarks } from "./parse-speech-marks"
import type { SynthesizeInput, SynthesizeResult, TtsClient } from "./tts-client"

/**
 * PollyTtsClient が使う SDK の部分。テストでは send だけの偽物を渡す
 */
export type PollySendApi = Pick<PollyClient, "send">

/**
 * Polly の voice の ID か（SDK が持つ voice の一覧に含まれるか）。task が起動時に TTS_VOICE_ID を確かめる
 */
export const isPollyVoiceId = (value: string): value is VoiceId => (Object.values(VoiceId) as string[]).includes(value)

/**
 * レスポンスの AudioStream（SDK v3 のストリーム）をバイト列にする。無ければ throw
 */
const readAudioStream = async (stream: SynthesizeSpeechCommandOutput["AudioStream"]): Promise<Uint8Array> => {
  if (!stream) throw new Error("Polly returned no AudioStream")
  return stream.transformToByteArray()
}

/**
 * Amazon Polly（Neural）のクライアント。env は読まず、SDK のクライアントをコンストラクタで受ける（region・リトライは task が決める）
 *
 * - 音声（mp3）と単語の時刻（Speech Marks の word）は別々のリクエストで、どちらも課金される（README「費用」）
 * - SampleRate は指定しない（Neural の mp3 の既定は 24000 Hz）
 * - 一時的なエラー（throttling・5xx）は SDK の既定のリトライに任せ、ここでは再試行しない
 */
export class PollyTtsClient implements TtsClient {
  private _polly: PollySendApi

  constructor(polly: PollySendApi) {
    this._polly = polly
  }

  public async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    /**
     * voice は task が起動時に isPollyVoiceId で確かめている。不正な値は Polly が ValidationException で返す（isFatalTtsError）
     */
    const voiceId = input.voiceId as VoiceId
    const base = { Engine: "neural", Text: input.text, TextType: "text", VoiceId: voiceId } as const
    const [audioResponse, marksResponse] = await Promise.all([
      this._polly.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "mp3" })),
      this._polly.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "json", SpeechMarkTypes: ["word"] })),
    ])
    const [audio, marks] = await Promise.all([
      readAudioStream(audioResponse.AudioStream),
      readAudioStream(marksResponse.AudioStream),
    ])
    return {
      audio: Buffer.from(audio),
      billedCharacters: (audioResponse.RequestCharacters ?? 0) + (marksResponse.RequestCharacters ?? 0),
      marks: parseSpeechMarks(new TextDecoder().decode(marks)),
    }
  }
}
