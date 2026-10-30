/**
 * 人が原文を読んで確かめた、ドキュメントのリポジトリの情報
 */
export type VerifiedDocumentRepository = {
  /**
   * ドキュメントのディレクトリ。トップの URL のときの対象パス
   */
  documentsPath: string
  /**
   * 既定の除外パスに足す除外パス
   */
  extraExcludeGlobs?: string[]
  /**
   * README.md が本物のページなので、既定の除外パスから外す
   */
  hasReadmePages?: boolean
  /**
   * GitHub の検出がドキュメントのライセンスと違う・判定できないリポジトリの、ドキュメントのライセンス。path は記載があるファイル
   */
  license?: { path: string; spdx: string }
}

/**
 * キーは小文字の owner/name。足すときはライセンスの原文を読み、ドキュメントの文章に掛かっていることを確かめる
 */
export const VERIFIED_DOCUMENT_REPOSITORIES: Record<string, VerifiedDocumentRepository> = {
  "angular/angular": {
    documentsPath: "adev/src/content",
    hasReadmePages: true,
    license: { path: "adev/src/app/core/layout/footer/footer.component.html", spdx: "CC-BY-4.0" },
  },
  "golang/website": {
    documentsPath: "_content",
    extraExcludeGlobs: ["_content/doc/go1*.md"],
    license: { path: "_content/copyright.md", spdx: "CC-BY-4.0" },
  },
  "microsoft/typescript-website": {
    documentsPath: "packages/documentation/copy/en",
  },
  "nodejs/node": {
    documentsPath: "doc/api",
    license: { path: "LICENSE", spdx: "MIT" },
  },
  "rust-lang/book": {
    documentsPath: "src",
    license: { path: "COPYRIGHT", spdx: "MIT" },
  },
  "vuejs/docs": {
    documentsPath: "src",
    license: { path: "LICENSE", spdx: "CC-BY-4.0" },
  },
}

/**
 * 本文を問題にできないリポジトリ（小文字の owner/name）。github/docs は製品名などが変数で書かれていて、消すと文章が欠ける
 */
export const UNSUPPORTED_DOCUMENT_REPOSITORIES = ["github/docs"]
