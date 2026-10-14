import { parseSpeechMarks } from "../../../src/client/polly"

describe("parseSpeechMarks", () => {
  describe("正常系", () => {
    it("1 行 1 つの JSON を word の Speech Mark にする（type は落とす）", () => {
      const ndjson = [
        "{\"time\":6,\"type\":\"word\",\"start\":0,\"end\":7,\"value\":\"Effects\"}",
        "{\"time\":373,\"type\":\"word\",\"start\":8,\"end\":11,\"value\":\"run\"}",
      ].join("\n")

      expect(parseSpeechMarks(ndjson)).toEqual([
        { end: 7, start: 0, time: 6, value: "Effects" },
        { end: 11, start: 8, time: 373, value: "run" },
      ])
    })

    it("空行（末尾の改行を含む）を飛ばす", () => {
      const ndjson = "\n{\"time\":0,\"type\":\"word\",\"start\":0,\"end\":2,\"value\":\"Hi\"}\n\n"

      expect(parseSpeechMarks(ndjson)).toEqual([{ end: 2, start: 0, time: 0, value: "Hi" }])
    })

    it("word 以外（sentence など）は捨てる", () => {
      const ndjson = [
        "{\"time\":0,\"type\":\"sentence\",\"start\":0,\"end\":11,\"value\":\"Effects run\"}",
        "{\"time\":6,\"type\":\"word\",\"start\":0,\"end\":7,\"value\":\"Effects\"}",
      ].join("\n")

      expect(parseSpeechMarks(ndjson)).toEqual([{ end: 7, start: 0, time: 6, value: "Effects" }])
    })

    it("空文字は空配列", () => {
      expect(parseSpeechMarks("")).toEqual([])
    })
  })

  describe("異常系", () => {
    it("壊れた JSON は throw", () => {
      expect(() => parseSpeechMarks("{\"time\":0,\"type\":\"word\"")).toThrow("Invalid speech mark #1")
    })

    it("項目が足りない・型が違う行は throw", () => {
      expect(() => parseSpeechMarks("{\"time\":0,\"type\":\"word\",\"start\":\"0\",\"end\":2,\"value\":\"Hi\"}")).toThrow(
        "Invalid speech mark #1",
      )
    })
  })
})
