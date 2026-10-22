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
   * ライセンスのファイルの URL（https://github.com/{owner}/{repo}/blob/{default branch}/{path}）
   */
  licenseUrl: string
}

/**
 * GitHub のライセンス検出クライアントのインターフェース
 */
export interface IGitHubLicenseClient {
  /**
   * ライセンスのファイルが無い・リポジトリが無い（非公開を含む）なら null。通信障害や rate limit は throw
   */
  detectLicense(repository: string): Promise<DetectedLicense | null>
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
  html_url: z.string(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
})

/**
 * GET /repos/{owner}/{repo}/license でリポジトリのライセンスを検出する。
 * token は任意（未設定でも 60 req/h の範囲で動く）
 */
export class GitHubLicenseClient implements IGitHubLicenseClient {
  private _token: string | undefined

  constructor(token: string | undefined) {
    this._token = token
  }

  public async detectLicense(repository: string): Promise<DetectedLicense | null> {
    const [owner, name] = repository.split("/").map(encodeURIComponent)
    const response = await fetch(`${GITHUB_API_BASE_URL}/repos/${owner}/${name}/license`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TechEnglishBot/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    /**
     * ライセンスファイルが無い・リポジトリが無い（非公開を含む）
     */
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub license request failed: ${response.status}`)

    const body = githubLicenseResponseSchema.parse(await response.json())
    const spdxId = body.license?.spdx_id ?? null
    return { licenseSpdx: spdxId === NO_ASSERTION_SPDX_ID ? null : spdxId, licenseUrl: body.html_url }
  }
}
