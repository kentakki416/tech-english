import type { DictionaryEntry } from "@repo/domain"

import { generateLookupCandidates, pickFirstEntry } from "../../src/lib/lookup-dictionary"

const FIXED_DATE = new Date("2026-10-12T00:00:00.000Z")

const buildEntry = (id: number, headword: string): DictionaryEntry => ({
  id,
  headword,
  meaningJa: `${headword} の意味`,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
})

describe("generateLookupCandidates", () => {
  describe("正常系", () => {
    it.each([
      ["-ies → y（小文字にする）", "Libraries", ["libraries", "library", "librari", "librarie"]],
      ["-ed → なし（render は子音 + 母音 + 子音で終わるので e を補ったものを先に）", "rendered", ["rendered", "rendere", "render"]],
      ["-ed → e（語頭の母音 + 子音で終わる us より use を先に）", "used", ["used", "use", "us"]],
      ["-ing → 子音の重なりを 1 つに", "running", ["running", "runn", "runne", "run"]],
      ["-ing → e（cod より code を先に）", "coding", ["coding", "code", "cod"]],
      ["-ing → なし（母音で終わる語幹は補わないものを先に: doe より do）", "doing", ["doing", "do", "doe"]],
      ["-ing → なし（子音が 2 つで終わる語幹は補わないものを先に: singe より sing）", "singing", ["singing", "sing", "singe"]],
      ["-ed → 子音の重なりを 1 つに", "stopped", ["stopped", "stopp", "stoppe", "stop"]],
      ["-ied → y", "applied", ["applied", "apply", "appli", "applie"]],
      ["-es → なし・e（-s を外したもの）", "codes", ["codes", "code", "cod"]],
      ["-es → なし（-ss の語は -es を外したものを先に）", "passes", ["passes", "pass", "passe"]],
      ["-s → なし", "effects", ["effects", "effect"]],
      ["-ss は -s を外さない", "class", ["class"]],
      ["-er → 子音の重なりを 1 つに", "bigger", ["bigger", "bigg", "bigge", "big"]],
      ["-ier → y", "happier", ["happier", "happy", "happi", "happie"]],
      ["-iest → y", "easiest", ["easiest", "easy", "easi", "easie"]],
      ["-est → e", "latest", ["latest", "late", "lat"]],
      ["不規則変化（過去形）", "went", ["went", "go"]],
      ["不規則変化（複数形）", "children", ["children", "child"]],
      ["不規則変化（比較級）の後に語尾の規則", "better", ["better", "good", "bett", "bette", "bet"]],
      ["不規則変化 → 語尾の規則の順（is は -s を外すと 1 文字なので作らない）", "is", ["is", "be"]],
      ["末尾の 's を除く", "React's", ["react"]],
      ["’ は ' として扱う", "React’s", ["react"]],
      ["末尾の ' を除く", "users'", ["users", "user"]],
      ["語の途中の ' は残す", "don't", ["don't"]],
      ["Object.prototype のキーは不規則変化として拾わない", "constructor", ["constructor"]],
      ["語尾の規則に当てはまらなければ見出し語だけ", "xyzzy", ["xyzzy"]],
    ])("%s: %s", (_label, word, expected) => {
      expect(generateLookupCandidates(word)).toEqual(expected)
    })

    it("ハイフンつきの語は、全体の候補の後に各部分の候補を前から並べる（接頭辞の部分は除く）", () => {
      expect(generateLookupCandidates("re-render")).toEqual(["re-render", "re-rend", "re-rende", "render", "rend", "rende"])
      expect(generateLookupCandidates("third-party")).toEqual(expect.arrayContaining(["third-party", "third", "party"]))
    })

    it("ハイフンつきの語の部分にも語尾の規則を使う", () => {
      expect(generateLookupCandidates("re-running")).toEqual([
        "re-running",
        "re-runn",
        "re-runne",
        "re-run",
        "running",
        "runn",
        "runne",
        "run",
      ])
    })

    it("候補に重複が無い（同じ部分が 2 回出ても 1 つ）", () => {
      const candidates = generateLookupCandidates("run-run")

      expect(candidates).toEqual(["run-run", "run"])
      expect(new Set(candidates).size).toBe(candidates.length)
    })

    it("空の部分（末尾のハイフン）と接頭辞だけの部分は捨てる", () => {
      expect(generateLookupCandidates("re-")).toEqual(["re-"])
      expect(generateLookupCandidates("api-")).toEqual(["api-", "api"])
    })
  })
})

describe("pickFirstEntry", () => {
  describe("正常系", () => {
    it("候補の順で最初に見つかった項目を返す（項目の並びには依らない）", () => {
      const entries = [buildEntry(1, "run"), buildEntry(2, "runne"), buildEntry(3, "rune")]

      expect(pickFirstEntry(["running", "runn", "runne", "run"], entries)).toEqual(buildEntry(2, "runne"))
    })

    it.each([
      ["Libraries", "library"],
      ["rendered", "render"],
      ["used", "use"],
      ["running", "run"],
      ["went", "go"],
      ["React's", "react"],
      ["coding", "code"],
      ["doing", "do"],
      ["singing", "sing"],
      ["notes", "note"],
      ["re-render", "render"],
    ])("紛らわしい語（us・cod・doe・singe・not・re 以外）を含む辞書でも %s は %s を引く", (word, expected) => {
      const headwords = ["library", "render", "us", "use", "run", "go", "react", "cod", "code", "do", "doe", "sing", "singe", "not", "note"]
      const entries = headwords.map((headword, index) => buildEntry(index + 1, headword))

      expect(pickFirstEntry(generateLookupCandidates(word), entries)?.headword).toBe(expected)
    })
  })

  describe("異常系", () => {
    it("どの候補も無ければ null を返す", () => {
      expect(pickFirstEntry(["xyzzy"], [buildEntry(1, "run")])).toBeNull()
      expect(pickFirstEntry(["run"], [])).toBeNull()
    })
  })
})
