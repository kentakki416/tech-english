import { decodePassageCursor, encodePassageCursor } from "../../src/lib/passage-cursor"

const encodeJson = (value: unknown): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url")

describe("encodePassageCursor / decodePassageCursor", () => {
  describe("正常系", () => {
    it("encode → decode すると元に戻る（ミリ秒まで）", () => {
      const cursor = { id: 42, publishedAt: new Date("2026-10-13T03:04:05.678Z") }

      const encoded = encodePassageCursor(cursor)

      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(decodePassageCursor(encoded)).toEqual(cursor)
    })
  })

  describe("異常系", () => {
    it.each([
      ["空文字", ""],
      ["base64url でない", "%%%"],
      ["JSON でない", Buffer.from("not json", "utf8").toString("base64url")],
      ["id が無い", encodeJson({ pa: "2026-10-13T03:04:05.678Z" })],
      ["id が 0", encodeJson({ id: 0, pa: "2026-10-13T03:04:05.678Z" })],
      ["id が整数でない", encodeJson({ id: 1.5, pa: "2026-10-13T03:04:05.678Z" })],
      ["pa が日時でない", encodeJson({ id: 1, pa: "yesterday" })],
      ["admin の問題一覧のカーソル", encodeJson({ id: 1, na: true, ua: "2026-10-13T03:04:05.678Z" })],
      ["配列", encodeJson([1, "2026-10-13T03:04:05.678Z"])],
    ])("%sなら null を返す", (_label, value) => {
      expect(decodePassageCursor(value)).toBeNull()
    })
  })
})
