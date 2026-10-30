import path from "node:path"

/**
 * 依存物・テストの Markdown は、ドキュメントの場所の推定に数えない
 */
const NON_DOCUMENT_DIRECTORY_NAMES = new Set([
  "__tests__",
  "contrib",
  "dependencies",
  "deps",
  "example",
  "examples",
  "external",
  "fixtures",
  "node_modules",
  "test",
  "testdata",
  "tests",
  "third-party",
  "third_party",
  "vendor",
])

/**
 * トップにあればドキュメントとみなすディレクトリ（この順で選ぶ）
 */
const CONVENTIONAL_DOCUMENT_DIRECTORY_NAMES = ["docs", "doc", "documentation", "content"]

/**
 * これより少ない docs は、ドキュメントの本体ではなく開発の覚え書きとみなす
 */
const MIN_CONVENTIONAL_DOCUMENT_FILE_COUNT = 20

/**
 * 1 つのディレクトリにこの割合以上の Markdown が集まっていれば、そこに降りる
 */
const DOMINANT_DIRECTORY_RATIO = 0.7

/**
 * ドキュメントのディレクトリの中で降りてよい名前。製品ごとの分類（Docker の manuals）に降りて、ほかのページを落とさないため
 */
const NESTED_DOCUMENT_DIRECTORY_NAMES = new Set(["content", "docs", "en", "source", "sources", "src"])

const ENGLISH_DIRECTORY_NAME = "en"

const LOCALE_DIRECTORY_NAMES = [
  "ar", "bn", "de", "es", "fa", "fr", "hi", "id", "it", "ja", "ko", "pl", "pt", "pt-BR", "pt-br", "ru", "th", "tr", "uk", "vi",
  "zh", "zh-CN", "zh-Hans", "zh-Hant", "zh-TW", "zh-cn", "zh-hans", "zh-hant", "zh-tw",
]

const CHANGELOG_NAMES = "{CHANGELOG,CHANGES,Changelog,change-log,change_log,changelog}"

const RELEASE_NOTE_NAMES = "*{RELEASE-NOTE,RELEASE_NOTE,release-note,release_note,releasenote}"

const WHATS_NEW_NAMES = "{whats-new,whats_new,whatsnew}"

/**
 * 版は 2〜3 要素の数字だけにする（Cloudflare の製品の `1.1.1.1/` を外さないため）。`snippets/` は入れない（Cloudflare の製品のページがあり、部品は `_snippets/` のように `_` で始まることが多い）。
 * ディレクトリの除外は、末尾の `**` の後にファイルの `*` まで書く。picomatch の `a/**` は a 自身にも一致し、同じ名前のファイルまで外れるため
 */
const DEFAULT_EXCLUDE_GLOB_SUFFIXES = [
  `**/${CHANGELOG_NAMES}*`,
  `**/${CHANGELOG_NAMES}*/**/*`,
  `**/${RELEASE_NOTE_NAMES}*`,
  `**/${RELEASE_NOTE_NAMES}*/**/*`,
  `**/${WHATS_NEW_NAMES}*`,
  `**/${WHATS_NEW_NAMES}*/**/*`,
  "**/{blog,contribute,contributing,contributors,previous-versions,versioned_docs}/**/*",
  "**/{includes,partials}/**/*",
  "**/_*/**/*",
  "**/{+([0-9]).+([0-9])?(.+([0-9])),v+([0-9]).+([0-9])?(.+([0-9])),version-[0-9]*}/**/*",
  "**/{AGENTS,CLAUDE,CODE_OF_CONDUCT,CONTRIBUTING,GEMINI,SECURITY,STYLE,STYLEGUIDE}.{md,mdx}",
]

const README_EXCLUDE_GLOB_SUFFIX = "**/{README,Readme,readme}.{md,mdx}"

const hasOnlyDocumentDirectories = (filePath: string): boolean =>
  filePath.split("/").slice(0, -1).every((name) => !name.startsWith(".") && !NON_DOCUMENT_DIRECTORY_NAMES.has(name))

/**
 * パスがディレクトリの中（ディレクトリ自身を含む）にあるか。directory が空文字ならルートなので常に true
 */
export const isInsideDirectory = (targetPath: string, directory: string): boolean =>
  directory === "" || targetPath === directory || targetPath.startsWith(`${directory}/`)

const countFilesByChildDirectory = (filePaths: string[], directory: string): Map<string, number> => {
  const prefix = directory === "" ? "" : `${directory}/`
  const counts = new Map<string, number>()
  for (const filePath of filePaths) {
    const [name, ...rest] = filePath.slice(prefix.length).split("/")
    if (rest.length > 0) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

const findEnglishDirectory = (childCounts: Map<string, number>): string | null => {
  const localeCount = [...childCounts.keys()].filter((name) => LOCALE_DIRECTORY_NAMES.includes(name)).length
  return childCounts.has(ENGLISH_DIRECTORY_NAME) && localeCount >= 2 ? ENGLISH_DIRECTORY_NAME : null
}

/**
 * 今のディレクトリから降りる先の名前。降りなければ null
 */
const findNextDirectoryName = (
  filePaths: string[],
  directory: string,
  options: { isInsideDocuments: boolean },
): string | null => {
  const insideCount = filePaths.filter((filePath) => isInsideDirectory(filePath, directory)).length
  const childCounts = countFilesByChildDirectory(filePaths.filter((filePath) => isInsideDirectory(filePath, directory)), directory)
  const englishDirectory = findEnglishDirectory(childCounts)
  if (englishDirectory) return englishDirectory

  const [largest] = [...childCounts.entries()].sort(([, a], [, b]) => b - a)
  if (!largest || largest[1] / insideCount < DOMINANT_DIRECTORY_RATIO) return null
  return !options.isInsideDocuments || NESTED_DOCUMENT_DIRECTORY_NAMES.has(largest[0]) ? largest[0] : null
}

/**
 * リポジトリの Markdown のパスから、ドキュメントのディレクトリを推定する。ドキュメントだけのリポジトリや推定できないときは空文字（ルート）。
 * トップの docs などを優先し、無ければ Markdown が集まっているディレクトリに降りる
 */
export const findDocumentsDirectory = (markdownPaths: string[]): string => {
  const filePaths = markdownPaths.filter(hasOnlyDocumentDirectories)
  const topCounts = countFilesByChildDirectory(filePaths, "")
  let directory = CONVENTIONAL_DOCUMENT_DIRECTORY_NAMES.find((name) => (topCounts.get(name) ?? 0) >= MIN_CONVENTIONAL_DOCUMENT_FILE_COUNT) ?? ""
  let isInsideDocuments = directory !== ""

  for (;;) {
    const next = findNextDirectoryName(filePaths, directory, { isInsideDocuments })
    if (next === null) return directory
    directory = directory === "" ? next : `${directory}/${next}`
    isInsideDocuments ||= CONVENTIONAL_DOCUMENT_DIRECTORY_NAMES.includes(next)
  }
}

/**
 * 対象パスのディレクトリに当てる既定の除外パス。glob はリポジトリのルートからのパスに当たるので、対象パスを頭に付ける
 * （付けないと、`_` で始まるディレクトリの除外に Go の `_content` がすべて掛かる）。翻訳は対象パスの直下だけ（MDN の `id/` のようなページを外さないため）
 */
export const buildDefaultExcludeGlobs = (documentsPath: string, options: { hasReadmePages: boolean }): string[] => {
  const prefix = documentsPath === "" ? "" : `${documentsPath}/`
  const suffixes = [
    `{${LOCALE_DIRECTORY_NAMES.join(",")}}/**/*`,
    ...DEFAULT_EXCLUDE_GLOB_SUFFIXES,
    ...(options.hasReadmePages ? [] : [README_EXCLUDE_GLOB_SUFFIX]),
  ]
  return suffixes.map((suffix) => `${prefix}${suffix}`)
}

/**
 * パス自身と、ルートより下の親のディレクトリを、浅い順に返す。`a/b` なら `["a", "a/b"]`、空文字なら空
 */
export const listDirectoryAndAncestors = (directory: string): string[] => {
  const segments = directory.split("/").filter((segment) => segment !== "")
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"))
}

/**
 * ファイルのあるディレクトリ。ルートのファイルなら空文字
 */
export const findParentDirectory = (filePath: string): string => {
  const directory = path.posix.dirname(filePath)
  return directory === "." ? "" : directory
}
