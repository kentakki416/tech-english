import { parseCollectArgs } from "../../src/lib/parse-collect-args"

describe("parseCollectArgs", () => {
  describe("正常系", () => {
    it.each([
      ["引数なし", [], { dryRun: false, sourceId: null }],
      ["--source-id=3", ["--source-id=3"], { dryRun: false, sourceId: 3 }],
      ["--source-id 3（空白区切り）", ["--source-id", "3"], { dryRun: false, sourceId: 3 }],
      ["--source-id=3 --dry-run", ["--source-id=3", "--dry-run"], { dryRun: true, sourceId: 3 }],
      ["--dry-run --source-id=12（順不同）", ["--dry-run", "--source-id=12"], { dryRun: true, sourceId: 12 }],
    ])("%s を読める", (_label, argv, expected) => {
      expect(parseCollectArgs(argv)).toEqual(expected)
    })
  })

  describe("異常系", () => {
    it.each([
      ["--source-id=abc", ["--source-id=abc"]],
      ["--source-id=-1", ["--source-id=-1"]],
      ["--source-id=1.5", ["--source-id=1.5"]],
      ["未知のフラグ", ["--source-id=3", "--force"]],
      ["位置引数", ["3"]],
      ["--dry-run 単独", ["--dry-run"]],
      ["--source-id の値なし", ["--source-id"]],
    ])("%s は throw する", (_label, argv) => {
      expect(() => parseCollectArgs(argv)).toThrow()
    })
  })
})
