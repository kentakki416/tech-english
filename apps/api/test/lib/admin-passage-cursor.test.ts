import { decodeAdminPassageCursor, encodeAdminPassageCursor } from "../../src/lib/admin-passage-cursor"

const encodeJson = (value: unknown): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url")

describe("encodeAdminPassageCursor / decodeAdminPassageCursor", () => {
  describe("正常系", () => {
    it.each([
      ["要確認", { id: 42, needsAttention: true, updatedAt: new Date("2026-10-13T03:04:05.678Z") }],
      ["要確認でない", { id: 1, needsAttention: false, updatedAt: new Date("2026-01-01T00:00:00.000Z") }],
    ])("%sの cursor を encode → decode すると元に戻る（ミリ秒まで）", (_label, cursor) => {
      const encoded = encodeAdminPassageCursor(cursor)

      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(decodeAdminPassageCursor(encoded)).toEqual(cursor)
    })
  })

  describe("異常系", () => {
    it.each([
      ["空文字", ""],
      ["base64url でない", "%%%"],
      ["JSON でない", Buffer.from("not json", "utf8").toString("base64url")],
      ["id が無い", encodeJson({ na: true, ua: "2026-10-13T03:04:05.678Z" })],
      ["id が 0", encodeJson({ id: 0, na: true, ua: "2026-10-13T03:04:05.678Z" })],
      ["na が boolean でない", encodeJson({ id: 1, na: "true", ua: "2026-10-13T03:04:05.678Z" })],
      ["ua が日時でない", encodeJson({ id: 1, na: true, ua: "yesterday" })],
      ["配列", encodeJson([1, true, "2026-10-13T03:04:05.678Z"])],
    ])("%sなら null を返す", (_label, value) => {
      expect(decodeAdminPassageCursor(value)).toBeNull()
    })
  })
})
