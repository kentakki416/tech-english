import type { PassageAudioManifest } from "@repo/domain"

import { buildSentenceClip } from "../../src/lib/build-sentence-clip"

/**
 * ブロック 1 の 2 パート（2 文目からパート 2）と、ブロック 4 の単語の無いパート
 */
const MANIFEST: PassageAudioManifest = {
  blocks: [
    {
      blockIndex: 1,
      parts: [
        { durationMs: 2000, key: "passages/1/h/1-0.mp3", words: [[0, 400, 0, 7], [400, 900, 8, 11], [900, 2000, 12, 21]] },
        { durationMs: 1500, key: "passages/1/h/1-1.mp3", words: [[0, 700, 23, 27], [700, 1500, 28, 36]] },
      ],
    },
    { blockIndex: 4, parts: [{ durationMs: 500, key: "passages/1/h/4-0.mp3", words: [] }] },
  ],
}

describe("buildSentenceClip", () => {
  describe("正常系", () => {
    it("範囲に収まる単語の、最初の単語の始めから最後の単語の終わりまで", () => {
      expect(buildSentenceClip(MANIFEST, { blockIndex: 1, endOffset: 22, startOffset: 0 }))
        .toEqual({ endMs: 2000, key: "passages/1/h/1-0.mp3", startMs: 0 })
      expect(buildSentenceClip(MANIFEST, { blockIndex: 1, endOffset: 36, startOffset: 23 }))
        .toEqual({ endMs: 1500, key: "passages/1/h/1-1.mp3", startMs: 0 })
    })

    it("範囲の境目にかかる単語（一部だけ入る）は含めない（境界値）", () => {
      expect(buildSentenceClip(MANIFEST, { blockIndex: 1, endOffset: 20, startOffset: 1 }))
        .toEqual({ endMs: 900, key: "passages/1/h/1-0.mp3", startMs: 400 })
      expect(buildSentenceClip(MANIFEST, { blockIndex: 1, endOffset: 21, startOffset: 8 }))
        .toEqual({ endMs: 2000, key: "passages/1/h/1-0.mp3", startMs: 400 })
    })
  })

  describe("異常系", () => {
    it("ブロックがマニフェストに無ければ null（code のブロックなど）", () => {
      expect(buildSentenceClip(MANIFEST, { blockIndex: 3, endOffset: 10, startOffset: 0 })).toBeNull()
    })

    it("範囲に単語が無ければ null", () => {
      expect(buildSentenceClip(MANIFEST, { blockIndex: 4, endOffset: 10, startOffset: 0 })).toBeNull()
      expect(buildSentenceClip(MANIFEST, { blockIndex: 1, endOffset: 5, startOffset: 1 })).toBeNull()
    })

    it("範囲の単語が 2 つのパートにまたがれば null", () => {
      expect(buildSentenceClip(MANIFEST, { blockIndex: 1, endOffset: 36, startOffset: 12 })).toBeNull()
    })
  })
})
