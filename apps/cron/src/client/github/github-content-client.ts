import { z } from "zod"

import { GitHubNotFoundError, GitHubRateLimitError } from "./errors"

/**
 * git の tree の 1 エントリ。path は取得した tree からの相対パス
 */
export type GitHubTreeEntry = {
  path: string
  sha: string
  /**
   * blob のみ（バイト数）。tree / commit（submodule）は null
   */
  size: number | null
  type: "blob" | "commit" | "tree"
}

/**
 * GitHub のリポジトリの内容を読むクライアントのインターフェース
 */
export interface IGitHubContentClient {
  /**
   * ファイルの本文（raw）。ref はコミットの SHA を渡して、ツリーと同じ時点に固定する
   */
  getFileContent(repository: string, path: string, ref: string): Promise<string>
  getLatestCommitSha(repository: string, branch: string): Promise<string>
  /**
   * 最後のレスポンスの x-ratelimit-remaining。まだ呼んでいなければ null
   */
  getRateLimitRemaining(): number | null
  /**
   * treeSha はコミットの SHA でもよい（そのコミットのルートの tree になる）
   */
  getTree(
    repository: string,
    treeSha: string,
    options: { isRecursive: boolean },
  ): Promise<{ entries: GitHubTreeEntry[]; isTruncated: boolean }>
}

export type GitHubContentClientOptions = {
  /**
   * テストで差し替える。既定はグローバルの fetch
   */
  fetch?: typeof fetch
  /**
   * 未設定なら認証なし（60 req/h）
   */
  token: string | undefined
  userAgent: string
}

const GITHUB_API_BASE_URL = "https://api.github.com"

const GITHUB_API_VERSION = "2022-11-28"

const JSON_ACCEPT = "application/vnd.github+json"

const RAW_ACCEPT = "application/vnd.github.raw+json"

const REQUEST_TIMEOUT_MS = 10_000

/**
 * 外部 API のレスポンスは無検証キャストせず Zod で検証する（利用しないフィールドは無視）
 */
const commitResponseSchema = z.object({ sha: z.string().min(1) })

const treeResponseSchema = z.object({
  tree: z.array(
    z.object({
      path: z.string(),
      sha: z.string(),
      size: z.number().int().nonnegative().optional(),
      type: z.enum(["blob", "commit", "tree"]),
    }),
  ),
  truncated: z.boolean(),
})

/**
 * owner/name を /repos/{owner}/{repo} にする。それぞれ URL エンコードする
 */
const buildRepositoryPath = (repository: string): string => {
  const segments = repository.split("/")
  if (segments.length !== 2 || segments.some((segment) => segment === "")) {
    throw new Error(`Invalid GitHub repository (expected owner/name): ${repository}`)
  }
  return `/repos/${segments.map(encodeURIComponent).join("/")}`
}

/**
 * ファイルパスをセグメントごとに URL エンコードする（区切りの / は残す）
 */
const encodeFilePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/")

/**
 * GitHub REST API でリポジトリのコミット・ツリー・ファイルを読む。env は読まずコンストラクタで受ける
 */
export class GitHubContentClient implements IGitHubContentClient {
  private _fetch: typeof fetch
  private _rateLimitRemaining: number | null = null
  private _token: string | undefined
  private _userAgent: string

  constructor(options: GitHubContentClientOptions) {
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this._token = options.token
    this._userAgent = options.userAgent
  }

  public async getFileContent(repository: string, path: string, ref: string): Promise<string> {
    const response = await this._request(
      `${buildRepositoryPath(repository)}/contents/${encodeFilePath(path)}?ref=${encodeURIComponent(ref)}`,
      RAW_ACCEPT,
    )
    return response.text()
  }

  public async getLatestCommitSha(repository: string, branch: string): Promise<string> {
    const response = await this._request(
      `${buildRepositoryPath(repository)}/commits/${encodeURIComponent(branch)}`,
      JSON_ACCEPT,
    )
    return commitResponseSchema.parse(await response.json()).sha
  }

  public getRateLimitRemaining(): number | null {
    return this._rateLimitRemaining
  }

  public async getTree(
    repository: string,
    treeSha: string,
    options: { isRecursive: boolean },
  ): Promise<{ entries: GitHubTreeEntry[]; isTruncated: boolean }> {
    const query = options.isRecursive ? "?recursive=1" : ""
    const response = await this._request(
      `${buildRepositoryPath(repository)}/git/trees/${encodeURIComponent(treeSha)}${query}`,
      JSON_ACCEPT,
    )
    const { tree, truncated } = treeResponseSchema.parse(await response.json())
    return {
      entries: tree.map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size ?? null, type: entry.type })),
      isTruncated: truncated,
    }
  }

  /**
   * 1 リクエストを送り、x-ratelimit-remaining を記録する。404 と rate limit は専用のエラー、それ以外の失敗は Error で throw する
   */
  private async _request(path: string, accept: string): Promise<Response> {
    const response = await this._fetch(`${GITHUB_API_BASE_URL}${path}`, {
      headers: {
        Accept: accept,
        "User-Agent": this._userAgent,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const remaining = response.headers.get("x-ratelimit-remaining")
    if (remaining !== null) this._rateLimitRemaining = Number(remaining)
    if (response.status === 404) throw new GitHubNotFoundError(path)
    /**
     * 403 は権限不足でも返るので、残りが 0 か Retry-After（secondary rate limit）があるときだけ rate limit とみなす
     */
    if ((response.status === 403 || response.status === 429) && (remaining === "0" || response.headers.has("retry-after"))) {
      throw new GitHubRateLimitError(path)
    }
    if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${path}`)
    return response
  }
}
