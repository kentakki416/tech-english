import { Readable } from "node:stream"

import type { SynthesizeSpeechCommand, SynthesizeSpeechCommandOutput } from "@aws-sdk/client-polly"

import { isPollyVoiceId, PollyTtsClient } from "../../../src/client/polly"

/**
 * SDK の AudioStream（Node の Readable に transformTo* を足した SdkStream）の偽物
 */
const createAudioStream = (bytes: Uint8Array): NonNullable<SynthesizeSpeechCommandOutput["AudioStream"]> =>
  Object.assign(Readable.from([Buffer.from(bytes)]), {
    transformToByteArray: async () => bytes,
    transformToString: async (encoding?: string) => Buffer.from(bytes).toString(encoding as BufferEncoding | undefined),
    transformToWebStream: () => {
      throw new Error("transformToWebStream is not used")
    },
  })

const MP3_BYTES = new Uint8Array([0xff, 0xfb, 0x18, 0xc0, 0x00])

const MARKS_NDJSON = [
  "{\"time\":6,\"type\":\"word\",\"start\":0,\"end\":7,\"value\":\"Effects\"}",
  "{\"time\":373,\"type\":\"word\",\"start\":8,\"end\":11,\"value\":\"run\"}",
].join("\n")

/**
 * OutputFormat で音声と単語の時刻の応答を分ける send の偽物
 */
const createFakeSend = (overrides: { audio?: Partial<SynthesizeSpeechCommandOutput>; marks?: Partial<SynthesizeSpeechCommandOutput> } = {}) =>
  vi.fn(async (command: SynthesizeSpeechCommand): Promise<SynthesizeSpeechCommandOutput> => {
    if (command.input.OutputFormat === "mp3") {
      return { $metadata: {}, AudioStream: createAudioStream(MP3_BYTES), ContentType: "audio/mpeg", RequestCharacters: 17, ...overrides.audio }
    }
    return {
      $metadata: {},
      AudioStream: createAudioStream(new TextEncoder().encode(MARKS_NDJSON)),
      ContentType: "application/x-json-stream",
      RequestCharacters: 17,
      ...overrides.marks,
    }
  })

const createClient = (send: ReturnType<typeof createFakeSend>) => new PollyTtsClient({ send })

describe("PollyTtsClient", () => {
  describe("正常系", () => {
    it("音声（mp3）と単語の時刻（json・word）を別々に、Neural・text・指定の voice で 2 回呼ぶ", async () => {
      const send = createFakeSend()

      await createClient(send).synthesize({ text: "Effects run", voiceId: "Joanna" })

      expect(send).toHaveBeenCalledTimes(2)
      const inputs = send.mock.calls.map(([command]) => command.input)
      expect(inputs).toEqual(expect.arrayContaining([
        { Engine: "neural", OutputFormat: "mp3", Text: "Effects run", TextType: "text", VoiceId: "Joanna" },
        {
          Engine: "neural",
          OutputFormat: "json",
          SpeechMarkTypes: ["word"],
          Text: "Effects run",
          TextType: "text",
          VoiceId: "Joanna",
        },
      ]))
      /**
       * SampleRate は指定しない（Neural の mp3 の既定 24000 Hz）
       */
      expect(inputs.every((input) => input.SampleRate === undefined)).toBe(true)
    })

    it("mp3 のバイト列・parse した単語の時刻・2 つの RequestCharacters の合計を返す", async () => {
      const send = createFakeSend({ marks: { RequestCharacters: 20 } })

      const result = await createClient(send).synthesize({ text: "Effects run", voiceId: "Joanna" })

      expect(result.audio).toEqual(Buffer.from(MP3_BYTES))
      expect(result.marks).toEqual([
        { end: 7, start: 0, time: 6, value: "Effects" },
        { end: 11, start: 8, time: 373, value: "run" },
      ])
      expect(result.billedCharacters).toBe(37)
    })

    it("RequestCharacters が無ければ 0 として足す", async () => {
      const send = createFakeSend({ audio: { RequestCharacters: undefined }, marks: { RequestCharacters: undefined } })

      const result = await createClient(send).synthesize({ text: "Effects run", voiceId: "Joanna" })

      expect(result.billedCharacters).toBe(0)
    })
  })

  describe("異常系", () => {
    it("AudioStream が無ければ throw", async () => {
      const send = createFakeSend({ audio: { AudioStream: undefined } })

      await expect(createClient(send).synthesize({ text: "Effects run", voiceId: "Joanna" })).rejects.toThrow(
        "Polly returned no AudioStream",
      )
    })

    it("SDK のエラーはそのまま伝播する", async () => {
      const send = vi.fn(async () => {
        throw Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" })
      })

      await expect(new PollyTtsClient({ send }).synthesize({ text: "a", voiceId: "Joanna" }))
        .rejects.toThrow("Rate exceeded")
    })
  })
})

describe("isPollyVoiceId", () => {
  describe("正常系", () => {
    it.each(["Joanna", "Matthew", "Ruth"])("%s は Polly の voice", (value) => {
      expect(isPollyVoiceId(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "joanna", "NotAVoice"])("%j は Polly の voice ではない", (value) => {
      expect(isPollyVoiceId(value)).toBe(false)
    })
  })
})
