import { ALLOWED_LICENSES, PERSONAL_USE_LICENSE, SOURCE_FETCH_TYPES, SOURCE_KINDS } from "../../src/const/source"
import { findSourceNotCollectableReason, isAllowedLicense, isSourceFetchType, isSourceKind } from "../../src/rules/source"
import type { GitHubRepositorySource, WebsiteSource } from "../../src/types/source"

const GITHUB_SOURCE: GitHubRepositorySource = {
  id: 1,
  branch: "main",
  excludeGlobs: [],
  fetchType: "github_repository",
  includeGlobs: ["docs/**/*.md"],
  isEnabled: true,
  kind: "docs",
  lastCollectedAt: null,
  lastCollectedCommitSha: null,
  lastCollectedExtractionVersion: null,
  licenseSpdx: "MIT",
  licenseUrl: "https://github.com/example/docs/blob/main/LICENSE",
  name: "Example Docs",
  publicUrlStripPrefix: null,
  publicUrlTemplate: null,
  repository: "example/docs",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
}

const WEBSITE_SOURCE: WebsiteSource = {
  id: 2,
  contentSelector: null,
  excludeGlobs: [],
  excludeSelectors: [],
  fetchType: "website",
  includeGlobs: ["/doc/**"],
  isEnabled: false,
  kind: "docs",
  lastCollectedAt: null,
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://go.dev/copyright",
  name: "Go",
  siteUrl: "https://go.dev",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
}

describe("isSourceKind", () => {
  describe("正常系", () => {
    it.each(SOURCE_KINDS)("%s は種別の値である", (value) => {
      expect(isSourceKind(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "blog", "Docs", " docs"])("%j は種別の値ではない", (value) => {
      expect(isSourceKind(value)).toBe(false)
    })
  })
})

describe("isSourceFetchType", () => {
  describe("正常系", () => {
    it.each(SOURCE_FETCH_TYPES)("%s は取得方法の値である", (value) => {
      expect(isSourceFetchType(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "github", "rss", "Website"])("%j は取得方法の値ではない", (value) => {
      expect(isSourceFetchType(value)).toBe(false)
    })
  })
})

describe("isAllowedLicense", () => {
  describe("正常系", () => {
    it.each(ALLOWED_LICENSES)("%s は許可リストにある", (value) => {
      expect(isAllowedLicense(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    /**
     * ShareAlike・コピーレフト・NonCommercial は許可しない（content-collection README の許可リスト）。
     * SPDX 識別子は大文字小文字まで一致させる。個人の学習用は公開してよいライセンスではない
     */
    it.each(["", "CC-BY-SA-4.0", "GPL-3.0", "CC-BY-NC-4.0", "mit", "Apache 2.0", PERSONAL_USE_LICENSE])("%j は許可リストに無い", (value) => {
      expect(isAllowedLicense(value)).toBe(false)
    })
  })
})

describe("findSourceNotCollectableReason", () => {
  describe("正常系", () => {
    it("有効な GitHub のソースは収集できる（null）", () => {
      expect(findSourceNotCollectableReason(GITHUB_SOURCE)).toBeNull()
    })
  })

  describe("異常系", () => {
    it.each([
      ["ソースが無い", "not_found", null],
      ["サイトのソース", "website", WEBSITE_SOURCE],
      ["無効の GitHub のソース", "disabled", { ...GITHUB_SOURCE, isEnabled: false }],
    ] as const)("%s は %s", (_label, reason, source) => {
      expect(findSourceNotCollectableReason(source)).toBe(reason)
    })
  })
})
