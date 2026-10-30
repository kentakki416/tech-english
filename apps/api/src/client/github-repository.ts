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
}

const GITHUB_API_BASE_URL = "https://api.github.com"

/**
 * GitHub がライセンスを判別できなかったときの spdx_id（ライセンスファイルはあるが種類が分からない）
 */
const NO_ASSERTION_SPDX_ID = "NOASSERTION"

const REQUEST_TIMEOUT_MS = 10_000

/**
 * 外部 API のレスポンスは無検証キャストせず Zod で検証する（利用しないフィールドは無視）
 */
const githubLicenseResponseSchema = z.object({
  html_url: z.string().nullable(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
})

const githubRepositoryResponseSchema = z.object({
  default_branch: z.string(),
  full_name: z.string(),
})

const buildRepositoryPath = (repository: string): string => {
  const [owner, name] = repository.split("/").map(encodeURIComponent)
  return `/repos/${owner}/${name}`
}

/**
 * GET /repos/{owner}/{repo} と GET /repos/{owner}/{repo}/license でリポジトリの情報とライセンスを取る。
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
    return { licenseSpdx: spdxId === NO_ASSERTION_SPDX_ID ? null : spdxId, licenseUrl: body.html_url }
  }

  public async findRepository(repository: string): Promise<GitHubRepository | null> {
    const response = await this._request(buildRepositoryPath(repository))
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub repository request failed: ${response.status}`)

    const body = githubRepositoryResponseSchema.parse(await response.json())
    return { defaultBranch: body.default_branch, fullName: body.full_name }
  }

  private async _request(path: string): Promise<Response> {
    return fetch(`${GITHUB_API_BASE_URL}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TechEnglishBot/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }
}
