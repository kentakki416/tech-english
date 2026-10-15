import { TAG_COLORS } from "../../src/const/tag"
import { isTagColor, selectTagColor } from "../../src/rules/tag"
import type { TagColor } from "../../src/types/tag"

/**
 * 指定した色を指定した回数ずつ使った一覧を作る。指定が無い色は defaultCount 回
 */
const buildUsedColors = (counts: Partial<Record<TagColor, number>>, defaultCount: number): TagColor[] =>
  TAG_COLORS.flatMap((color) => Array.from({ length: counts[color] ?? defaultCount }, () => color))

describe("isTagColor", () => {
  describe("正常系", () => {
    it.each(TAG_COLORS)("%s はタグの色の値である", (value) => {
      expect(isTagColor(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "red", "Blue", " blue"])("%j はタグの色の値ではない", (value) => {
      expect(isTagColor(value)).toBe(false)
    })
  })
})

describe("selectTagColor", () => {
  describe("正常系", () => {
    it("タグが 0 個なら TAG_COLORS の先頭を返す", () => {
      expect(selectTagColor([])).toBe(TAG_COLORS[0])
      expect(selectTagColor([])).toBe("blue")
    })

    it("blue だけ使われていれば 2 番目の rose を返す", () => {
      expect(selectTagColor(["blue"])).toBe("rose")
    })

    it("全色が 1 回ずつなら blue、blue を 2 回にすると rose を返す", () => {
      expect(selectTagColor(buildUsedColors({}, 1))).toBe("blue")
      expect(selectTagColor(buildUsedColors({ blue: 2 }, 1))).toBe("rose")
    })

    it("最少の色が途中にあればその色を返す", () => {
      expect(selectTagColor(buildUsedColors({ emerald: 1 }, 2))).toBe("emerald")
    })

    it("最少が複数あればパレットの先頭に近い色を返す", () => {
      expect(selectTagColor(buildUsedColors({ amber: 0, sky: 0 }, 1))).toBe("amber")
    })

    it("末尾の色だけが最少なら末尾の色を返す", () => {
      expect(selectTagColor(buildUsedColors({ sky: 0 }, 1))).toBe("sky")
    })
  })
})
