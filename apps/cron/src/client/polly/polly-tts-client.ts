import {
  type PollyClient,
  SynthesizeSpeechCommand,
  type SynthesizeSpeechCommandOutput,
  VoiceId,
} from "@aws-sdk/client-polly"

import { parseSpeechMarks } from "./parse-speech-marks"
import type { SynthesizeAudioResult, SynthesizeInput, SynthesizeResult, TtsClient } from "./tts-client"

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
 * - 音声（mp3）と単語の時刻（Speech Marks の word）は別々のリクエストで、どちらも課金される（README「費用」）。
 *   成功したリクエストごとに課金文字数（RequestCharacters）を recordBilledCharacters で記録する。単語の発音（synthesizeAudio）は mp3 の 1 リクエストだけ
 * - SampleRate は指定しない（Neural の mp3 の既定は 24000 Hz）
 * - 一時的なエラー（throttling・5xx）は SDK の既定のリトライに任せ、ここでは再試行しない
 */
export class PollyTtsClient implements TtsClient {
  private _polly: PollySendApi

  constructor(polly: PollySendApi) {
    this._polly = polly
  }

  public async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const base = this._buildBaseInput(input)
    /**
     * 片方が失敗しても、成功した方は課金されているので記録してから throw する（Promise.all だと成功した方の文字数を取れない）
     */
    const responses = await Promise.allSettled([
      this._polly.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "mp3" })),
      this._polly.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "json", SpeechMarkTypes: ["word"] })),
    ])
    for (const response of responses) {
      if (response.status === "fulfilled") await input.recordBilledCharacters(response.value.RequestCharacters ?? 0)
    }
    const [audioResult, marksResult] = responses
    if (audioResult.status === "rejected") throw audioResult.reason
    if (marksResult.status === "rejected") throw marksResult.reason
    const audioResponse = audioResult.value
    const marksResponse = marksResult.value
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

  public async synthesizeAudio(input: SynthesizeInput): Promise<SynthesizeAudioResult> {
    const response = await this._polly.send(new SynthesizeSpeechCommand({ ...this._buildBaseInput(input), OutputFormat: "mp3" }))
    const billedCharacters = response.RequestCharacters ?? 0
    await input.recordBilledCharacters(billedCharacters)
    return { audio: Buffer.from(await readAudioStream(response.AudioStream)), billedCharacters }
  }

  /**
   * 読み上げと単語の発音で共通のリクエスト。voice は task が起動時に isPollyVoiceId で確かめている。
   * 不正な値は Polly が ValidationException で返す（isFatalAudioGenerationError）
   */
  private _buildBaseInput(input: SynthesizeInput) {
    return { Engine: "neural", Text: input.text, TextType: "text", VoiceId: input.voiceId as VoiceId } as const
  }
}
