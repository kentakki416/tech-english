import type { PassageAudioManifest } from "@repo/domain"

import { buildAudioKey, listUnusedAudioKeys } from "../../../src/lib/audio"

const buildManifest = (textHash: string, blockIndexes: number[]): PassageAudioManifest => ({
  blocks: blockIndexes.map((blockIndex) => ({
    blockIndex,
    parts: [{ durationMs: 1000, key: `passages/42/${textHash}/${blockIndex}-0.mp3`, words: [] }],
  })),
})

describe("buildAudioKey", () => {
  describe("正常系", () => {
    it("passages/{passageId}/{textHash}/{blockIndex}-{partIndex}.mp3", () => {
      expect(buildAudioKey({ blockIndex: 3, partIndex: 0, passageId: 42, textHash: "abc123" })).toBe("passages/42/abc123/3-0.mp3")
      expect(buildAudioKey({ blockIndex: 3, partIndex: 1, passageId: 42, textHash: "abc123" })).toBe("passages/42/abc123/3-1.mp3")
    })

    it("revision（作り直しの依頼で hash が同じとき）があれば passages/{passageId}/{textHash}-r{revision}/... にする", () => {
      expect(buildAudioKey({ blockIndex: 3, partIndex: 0, passageId: 42, revision: 1760324400000, textHash: "abc123" }))
        .toBe("passages/42/abc123-r1760324400000/3-0.mp3")
    })
  })
})

describe("listUnusedAudioKeys", () => {
  describe("正常系", () => {
    it("hash が変われば from のキーをすべて返す", () => {
      expect(listUnusedAudioKeys(buildManifest("old", [0, 2]), buildManifest("new", [0, 2]))).toEqual([
        "passages/42/old/0-0.mp3",
        "passages/42/old/2-0.mp3",
      ])
    })

    it("keep にも同じキーがあれば返さない", () => {
      expect(listUnusedAudioKeys(buildManifest("same", [0, 1, 2]), buildManifest("same", [0, 2]))).toEqual([
        "passages/42/same/1-0.mp3",
      ])
    })

    it("keep が null なら from のキーをすべて返す", () => {
      expect(listUnusedAudioKeys(buildManifest("old", [0]), null)).toEqual(["passages/42/old/0-0.mp3"])
    })
  })

  describe("異常系", () => {
    it("from が null なら空", () => {
      expect(listUnusedAudioKeys(null, buildManifest("new", [0]))).toEqual([])
    })
  })
})
