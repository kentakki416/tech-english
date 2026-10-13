import { forTesting } from "../../../src/client/polly/fake-tts-client"
import { measureMp3DurationMs } from "../../../src/lib/audio"

const { createSilentMp3 } = forTesting

/**
 * MPEG-2 Layer III・24 kHz・32 kbps・モノラルのフレーム（72 × 32000 ÷ 24000 = 96 バイト、576 サンプル = 24 ms）
 */
const createMpeg2Frames = (frameCount: number): Buffer => {
  const frame = Buffer.alloc(96)
  frame.set([0xff, 0xf3, 0x44, 0xc0])
  return Buffer.concat(Array.from({ length: frameCount }, () => frame))
}

/**
 * ID3v2.4 のタグ（ヘッダ 10 バイト + 本体。サイズは syncsafe 整数）
 */
const createId3v2Tag = (bodyBytes: number): Buffer => {
  const header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0, 0, (bodyBytes >> 7) & 0x7f, bodyBytes & 0x7f])
  return Buffer.concat([header, Buffer.alloc(bodyBytes, 0x20)])
}

/**
 * 決まった種から作る疑似乱数のバイト列（毎回同じ値）
 */
const createPseudoRandomBytes = (length: number): Buffer => {
  let seed = 42
  return Buffer.from(Array.from({ length }, () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed % 251
  }))
}

describe("measureMp3DurationMs", () => {
  describe("正常系", () => {
    it("FakeTtsClient の無音のフレーム（MPEG-1・32 kHz）10 個は 360 ms", () => {
      expect(measureMp3DurationMs(createSilentMp3(10))).toBe(360)
    })

    it("MPEG-2 Layer III（24 kHz）のフレーム 10 個は 240 ms", () => {
      expect(measureMp3DurationMs(createMpeg2Frames(10))).toBe(240)
    })

    it("先頭の ID3v2 タグを飛ばす", () => {
      expect(measureMp3DurationMs(Buffer.concat([createId3v2Tag(300), createSilentMp3(10)]))).toBe(360)
    })

    it("末尾の ID3v1 タグ（フレームでないバイト列）の前で止める", () => {
      const id3v1 = Buffer.concat([Buffer.from("TAG"), Buffer.alloc(125)])

      expect(measureMp3DurationMs(Buffer.concat([createSilentMp3(10), id3v1]))).toBe(360)
    })

    it("先頭の Xing / Info のフレームは長さに数えない", () => {
      const infoFrame = createSilentMp3(1)
      /**
       * MPEG-1・モノラルのサイド情報は 17 バイトなので、タグはヘッダ 4 + 17 = 21 バイト目から
       */
      infoFrame.write("Info", 21, "latin1")

      expect(measureMp3DurationMs(Buffer.concat([infoFrame, createSilentMp3(10)]))).toBe(360)
    })
  })

  describe("異常系", () => {
    it("ランダムなバイト列は throw", () => {
      expect(() => measureMp3DurationMs(createPseudoRandomBytes(4096))).toThrow("No MPEG audio frame")
    })

    it("空のバッファは throw", () => {
      expect(() => measureMp3DurationMs(Buffer.alloc(0))).toThrow("No MPEG audio frame")
    })

    it("1 つめのフレームが途中で切れていれば throw", () => {
      expect(() => measureMp3DurationMs(createSilentMp3(1).subarray(0, 100))).toThrow("No MPEG audio frame")
    })
  })
})
