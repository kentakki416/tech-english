import { GITHUB_REPOSITORY_PATTERN } from "@repo/domain"

/**
 * GitHub の URL が指すもの。tree はディレクトリ、blob はファイル、それ以外（トップ・/issues など）はリポジトリのトップ
 */
export type GitHubUrlTarget = "directory" | "file" | "root"

/**
 * GitHub の refAndPath は tree / blob より後ろのセグメント（ブランチとパスの区切りは default branch が分かるまで決まらない）
 */
export type SourceUrl =
  | { fetchType: "github_repository"; refAndPath: string[]; repository: string; target: GitHubUrlTarget }
  | { fetchType: "website"; path: string; siteUrl: string }

const GITHUB_HOSTNAMES = ["github.com", "www.github.com"]

const GIT_SUFFIX_PATTERN = /\.git$/

const TRAILING_SLASHES_PATTERN = /\/+$/

/**
 * 不正なエンコードはそのまま残す
 */
const decodePathSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const splitPathSegments = (pathname: string): string[] =>
  pathname.split("/").filter((segment) => segment !== "").map(decodePathSegment)

const findGitHubUrlTarget = (kind: string | undefined, refAndPath: string[]): GitHubUrlTarget => {
  if (refAndPath.length === 0) return "root"
  if (kind === "tree") return "directory"
  if (kind === "blob") return "file"
  return "root"
}

/**
 * github.com の URL だがリポジトリ（owner/repo）が無い・形が違うなら null。リポジトリは小文字にそろえる（登録と同じ）。
 * http は https にそろえ（サイトのソースは https だけ）、? と # 以降は見ない
 */
export const parseSourceUrl = (url: string): SourceUrl | null => {
  const parsed = new URL(url)
  if (!GITHUB_HOSTNAMES.includes(parsed.hostname)) {
    return { fetchType: "website", path: parsed.pathname, siteUrl: `https://${parsed.host}` }
  }

  const [owner, name, kind, ...rest] = splitPathSegments(parsed.pathname)
  if (owner === undefined || name === undefined) return null
  const repository = `${owner}/${name.replace(GIT_SUFFIX_PATTERN, "")}`
  if (!GITHUB_REPOSITORY_PATTERN.test(repository)) return null

  const target = findGitHubUrlTarget(kind, rest)
  return { fetchType: "github_repository", refAndPath: target === "root" ? [] : rest, repository: repository.toLowerCase(), target }
}

/**
 * tree / blob より後ろのセグメントを、ブランチとパスに分ける。空ならブランチは default branch。
 * ブランチ名は / を含められるので URL だけでは区切りが決まらない。default branch で始まればそれを、そうでなければ最初のセグメントをブランチにする
 * （候補ごとに GitHub に問い合わせれば正確になるが、ドキュメントの URL はほとんど default branch で、外れたらライセンスを確認できず登録の画面で止まるため）
 */
export const splitBranchAndPath = (refAndPath: string[], defaultBranch: string): { branch: string; path: string } => {
  if (refAndPath.length === 0) return { branch: defaultBranch, path: "" }
  const defaultBranchSegments = defaultBranch.split("/")
  const isDefaultBranch = defaultBranchSegments.every((segment, index) => refAndPath[index] === segment)
  const branchLength = isDefaultBranch ? defaultBranchSegments.length : 1
  return { branch: refAndPath.slice(0, branchLength).join("/"), path: refAndPath.slice(branchLength).join("/") }
}

/**
 * ディレクトリは `{パス}/**`、ファイルはそのパス、パスが無ければリポジトリ全体。収集が .md / .mdx に絞るので拡張子は付けない
 */
export const buildGitHubIncludeGlob = (target: GitHubUrlTarget, path: string): string => {
  if (path === "") return "**"
  return target === "file" ? path : `${path}/**`
}

/**
 * `{パス}/**` は picomatch ではパス自身にも一致する
 */
export const buildWebsiteIncludeGlob = (path: string): string => `${path.replace(TRAILING_SLASHES_PATTERN, "")}/**`
