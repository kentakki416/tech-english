import type { AudioStatus } from "@repo/domain"

import { buildAudioUrl, convertToUserAudioStatus, resolveAudioPublicUrlBase, resolveAudioStatus } from "../../src/lib/passage-audio"
import { buildPassageAudio } from "../fixture/passage-audio"

const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

const PUBLISHED_PASSAGE = { publishedAt: PUBLISHED_AT, status: "published" as const }

describe("resolveAudioStatus", () => {
  describe("正常系", () => {
    it("ready で、公開中の問題で、音声を作った時刻が公開日時より後なら ready", () => {
      expect(resolveAudioStatus(buildPassageAudio({ updatedAt: new Date("2026-10-12T04:00:00.000Z") }), PUBLISHED_PASSAGE)).toBe("ready")
    })

    it("ready で、音声を作った時刻と公開日時が同じなら ready（境界値）", () => {
      expect(resolveAudioStatus(buildPassageAudio({ updatedAt: PUBLISHED_AT }), PUBLISHED_PASSAGE)).toBe("ready")
    })

    it.each<AudioStatus>(["pending", "generating", "failed"])("%s はそのまま返す", (status) => {
      expect(resolveAudioStatus(buildPassageAudio({ status }), PUBLISHED_PASSAGE)).toBe(status)
    })

    it.each<AudioStatus>(["pending", "generating", "failed"])("非公開に戻した問題でも %s はそのまま返す", (status) => {
      expect(resolveAudioStatus(buildPassageAudio({ status }), { ...PUBLISHED_PASSAGE, status: "draft" })).toBe(status)
    })
  })

  describe("異常系", () => {
    it("音声の行が無ければ pending", () => {
      expect(resolveAudioStatus(null, PUBLISHED_PASSAGE)).toBe("pending")
    })

    it("ready でも、音声を作った後に公開し直されていれば pending（1 ミリ秒前。境界値）", () => {
      expect(resolveAudioStatus(buildPassageAudio({ updatedAt: new Date(PUBLISHED_AT.getTime() - 1) }), PUBLISHED_PASSAGE)).toBe("pending")
    })

    it("ready でも、公開日時が null なら pending", () => {
      expect(resolveAudioStatus(buildPassageAudio(), { publishedAt: null, status: "published" })).toBe("pending")
    })

    it("ready でも、マニフェストが無ければ pending", () => {
      expect(resolveAudioStatus(buildPassageAudio({ manifest: null }), PUBLISHED_PASSAGE)).toBe("pending")
    })

    it.each(["draft", "rejected"] as const)(
      "ready でも、問題が %s（非公開に戻した）なら、音声を作った後に公開し直されていなくても pending（published_at は残り、下書きのまま本文を直せるため）",
      (status) => {
        expect(resolveAudioStatus(buildPassageAudio({ updatedAt: new Date("2026-10-12T04:00:00.000Z") }), { ...PUBLISHED_PASSAGE, status })).toBe("pending")
      },
    )
  })
})

describe("convertToUserAudioStatus", () => {
  describe("正常系", () => {
    it("generating は pending にする", () => {
      expect(convertToUserAudioStatus("generating")).toBe("pending")
    })

    it.each<AudioStatus>(["pending", "ready", "failed"])("%s はそのまま返す", (status) => {
      expect(convertToUserAudioStatus(status)).toBe(status)
    })
  })
})

describe("buildAudioUrl", () => {
  describe("正常系", () => {
    it.each([
      ["末尾のスラッシュなし", "http://localhost:8080/media"],
      ["末尾のスラッシュあり", "http://localhost:8080/media/"],
      ["末尾のスラッシュが 2 つ", "http://localhost:8080/media//"],
    ])("base の%sでも同じ URL になる", (_label, baseUrl) => {
      expect(buildAudioUrl(baseUrl, "passages/48/abc/1-0.mp3")).toBe("http://localhost:8080/media/passages/48/abc/1-0.mp3")
    })

    it("キーの先頭にスラッシュがあっても 1 つにする", () => {
      expect(buildAudioUrl("https://d111111abcdef8.cloudfront.net", "/passages/48/abc/1-0.mp3")).toBe(
        "https://d111111abcdef8.cloudfront.net/passages/48/abc/1-0.mp3",
      )
    })
  })
})

describe("resolveAudioPublicUrlBase", () => {
  describe("正常系", () => {
    it.each(["development", "test", "production"])("AUDIO_PUBLIC_URL_BASE があれば %s でもそれを使う", (nodeEnv) => {
      expect(
        resolveAudioPublicUrlBase({ audioPublicUrlBase: "https://d111111abcdef8.cloudfront.net", nodeEnv, port: 8080 }),
      ).toBe("https://d111111abcdef8.cloudfront.net")
    })

    it.each(["development", "test"])("%s で未設定ならローカルの /media（PORT を使う）", (nodeEnv) => {
      expect(resolveAudioPublicUrlBase({ audioPublicUrlBase: undefined, nodeEnv, port: 8090 })).toBe("http://localhost:8090/media")
    })
  })

  describe("異常系", () => {
    it("production で未設定ならローカルにフォールバックせず null", () => {
      expect(resolveAudioPublicUrlBase({ audioPublicUrlBase: undefined, nodeEnv: "production", port: 8080 })).toBeNull()
    })
  })
})
