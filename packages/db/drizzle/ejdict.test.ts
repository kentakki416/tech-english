/**
 * packages/db には vitest が無いため Node 標準の node:test で書く。
 * 実行: pnpm --filter @repo/db test（= tsx --test drizzle/ejdict.test.ts）
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { convertEjdictLinesToEntries } from "./ejdict"

describe("convertEjdictLinesToEntries", () => {
  describe("正常系", () => {
    it("見出し語と意味を TAB で分ける。意味の前後の空白は除く", () => {
      assert.deepEqual(convertEjdictLinesToEntries(["cache\t〈C〉隠し場所 / キャッシュ "]), [
        { headword: "cache", meaningJa: "〈C〉隠し場所 / キャッシュ" },
      ])
    })

    it("カンマ区切りの見出し語を分け、それぞれ同じ意味で登録する（前後の空白も除く）", () => {
      assert.deepEqual(convertEjdictLinesToEntries(["color, colour\t色"]), [
        { headword: "color", meaningJa: "色" },
        { headword: "colour", meaningJa: "色" },
      ])
    })

    it("大文字の見出し語を小文字にする", () => {
      assert.deepEqual(convertEjdictLinesToEntries(["HTML\tHyperText Markup Language", "A level\t上級試験"]), [
        { headword: "html", meaningJa: "HyperText Markup Language" },
        { headword: "a level", meaningJa: "上級試験" },
      ])
    })

    it("小文字化で重なる見出し語の意味を ` / ` でつなげて 1 行にする（最初に出てきた位置に置く）", () => {
      assert.deepEqual(convertEjdictLinesToEntries(["Polish\tポーランドの", "pole\t棒", "polish\t…を磨く"]), [
        { headword: "polish", meaningJa: "ポーランドの / …を磨く" },
        { headword: "pole", meaningJa: "棒" },
      ])
    })

    it("同じ行の中で小文字化して重なる見出し語（A,a,an の A と a）は、同じ意味を重ねない", () => {
      assert.deepEqual(convertEjdictLinesToEntries(["A,a,an\t不定冠詞"]), [
        { headword: "a", meaningJa: "不定冠詞" },
        { headword: "an", meaningJa: "不定冠詞" },
      ])
    })

    it("意味に TAB が含まれても、最初の TAB だけで分ける", () => {
      assert.deepEqual(convertEjdictLinesToEntries(["tab\tタブ\t記号"]), [{ headword: "tab", meaningJa: "タブ\t記号" }])
    })
  })

  describe("異常系", () => {
    it("TAB の無い行・空行・意味が空の行・見出し語が空の行を捨てる", () => {
      assert.deepEqual(convertEjdictLinesToEntries(["no tab here", "", "empty\t ", "\t見出し語なし", " , \t空の見出し語", "ok\tよい"]), [
        { headword: "ok", meaningJa: "よい" },
      ])
    })

    it("行が無ければ空配列", () => {
      assert.deepEqual(convertEjdictLinesToEntries([]), [])
    })
  })
})
