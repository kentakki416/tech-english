import { z } from "zod"

/**
 * GitHub が見つけたリポジトリのライセンス
 */
export type DetectedLicense = {
  /**
   * GitHub が判定したライセンスの SPDX 識別子。判定できなければ null（NOASSERTION。ファイルはあっても種類が分からない・複数ある）
   */
  licenseSpdx: string | null
  /**
   * ライセンスのファイルの URL（https://github.com/{owner}/{repo}/blob/{ref}/{path}）。GitHub が返さなければ null
   */
  licenseUrl: string | null
  /**
   * ライセンスのファイルの blob SHA
   */
  sha: string
}

/**
 * ディレクトリの直下のファイル
 */
export type GitHubDirectoryFile = {
  htmlUrl: string
  name: string
  sha: string
}

export type GitHubRepository = {
  defaultBranch: string
  /**
   * owner/name。改名したリポジトリは改名後の名前
   */
  fullName: string
}

export interface IGitHubRepositoryClient {
  /**
   * ライセンスのファイルが無い・リポジトリやブランチが無い（非公開を含む）なら null。通信障害や rate limit は throw
   */
  detectLicense(repository: string, ref: string): Promise<DetectedLicense | null>
  /**
   * リポジトリが無い（非公開を含む）なら null。改名したリポジトリは GitHub の redirect を fetch がたどり、改名後の名前を返す。
   * 通信障害や rate limit は throw
   */
  findRepository(repository: string): Promise<GitHubRepository | null>
  /**
   * ディレクトリの直下のファイル。ディレクトリやブランチが無い（ファイルを渡したときも含む）なら空。通信障害や rate limit は throw
   */
  listDirectoryFiles(repository: string, ref: string, directory: string): Promise<GitHubDirectoryFile[]>
  /**
   * リポジトリの .md / .mdx のパス。リポジトリやブランチが無ければ空。大きなリポジトリは GitHub が切り詰めた分だけを返す。
   * 通信障害や rate limit は throw
   */
  listMarkdownPaths(repository: string, ref: string): Promise<string[]>
}

const GITHUB_API_BASE_URL = "https://api.github.com"

/**
 * GitHub がライセンスを判別できなかったときの spdx_id（ライセンスファイルはあるが種類が分からない）
 */
const NO_ASSERTION_SPDX_ID = "NOASSERTION"

const REQUEST_TIMEOUT_MS = 10_000

/**
 * ツリーは大きなリポジトリで数 MB になる。API Gateway の 29 秒に、ほかの GitHub の呼び出しの分を残して収める
 */
const TREE_REQUEST_TIMEOUT_MS = 15_000

const MARKDOWN_PATH_PATTERN = /\.mdx?$/i

/**
 * 外部 API のレスポンスは無検証キャストせず Zod で検証する（利用しないフィールドは無視）
 */
const githubLicenseResponseSchema = z.object({
  html_url: z.string().nullable(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
  sha: z.string(),
})

const githubRepositoryResponseSchema = z.object({
  default_branch: z.string(),
  full_name: z.string(),
})

const githubTreeResponseSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string() })),
})

const githubDirectoryResponseSchema = z.array(z.object({
  html_url: z.string().nullable(),
  name: z.string(),
  sha: z.string(),
  type: z.string(),
}))

const buildRepositoryPath = (repository: string): string => {
  const [owner, name] = repository.split("/").map(encodeURIComponent)
  return `/repos/${owner}/${name}`
}

/**
 * GitHub の REST API でリポジトリの情報・ライセンス・ファイルの一覧を取る。
 * token は任意（未設定でも 60 req/h の範囲で動く）
 */
export class GitHubRepositoryClient implements IGitHubRepositoryClient {
  private _token: string | undefined

  constructor(token: string | undefined) {
    this._token = token
  }

  public async detectLicense(repository: string, ref: string): Promise<DetectedLicense | null> {
    const response = await this._request(`${buildRepositoryPath(repository)}/license?ref=${encodeURIComponent(ref)}`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub license request failed: ${response.status}`)

    const body = githubLicenseResponseSchema.parse(await response.json())
    const spdxId = body.license?.spdx_id ?? null
    return { licenseSpdx: spdxId === NO_ASSERTION_SPDX_ID ? null : spdxId, licenseUrl: body.html_url, sha: body.sha }
  }

  public async findRepository(repository: string): Promise<GitHubRepository | null> {
    const response = await this._request(buildRepositoryPath(repository))
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub repository request failed: ${response.status}`)

    const body = githubRepositoryResponseSchema.parse(await response.json())
    return { defaultBranch: body.default_branch, fullName: body.full_name }
  }

  public async listDirectoryFiles(repository: string, ref: string, directory: string): Promise<GitHubDirectoryFile[]> {
    const encodedDirectory = directory.split("/").map(encodeURIComponent).join("/")
    const response = await this._request(`${buildRepositoryPath(repository)}/contents/${encodedDirectory}?ref=${encodeURIComponent(ref)}`)
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`GitHub contents request failed: ${response.status}`)

    const body = githubDirectoryResponseSchema.safeParse(await response.json())
    if (!body.success) return []
    return body.data.flatMap((entry) =>
      entry.type === "file" && entry.html_url !== null ? [{ htmlUrl: entry.html_url, name: entry.name, sha: entry.sha }] : [],
    )
  }

  public async listMarkdownPaths(repository: string, ref: string): Promise<string[]> {
    const response = await this._request(
      `${buildRepositoryPath(repository)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      TREE_REQUEST_TIMEOUT_MS,
    )
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`GitHub tree request failed: ${response.status}`)

    const { tree } = githubTreeResponseSchema.parse(await response.json())
    return tree.filter((entry) => entry.type === "blob" && MARKDOWN_PATH_PATTERN.test(entry.path)).map((entry) => entry.path)
  }

  private async _request(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    return fetch(`${GITHUB_API_BASE_URL}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TechEnglishBot/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  }
}
