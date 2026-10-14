/**
 * GitHub API が 404 を返した（リポジトリ・ブランチ・ファイルが無い、または非公開）
 */
export class GitHubNotFoundError extends Error {
  public readonly path: string

  constructor(path: string) {
    super(`GitHub resource not found: ${path}`)
    this.name = "GitHubNotFoundError"
    this.path = path
  }
}

/**
 * GitHub API の rate limit を使い切った（403 / 429）。rate limit は token 単位なので、以降の GitHub のソースも処理できない
 */
export class GitHubRateLimitError extends Error {
  public readonly path: string

  constructor(path: string) {
    super(`GitHub rate limit exceeded: ${path}`)
    this.name = "GitHubRateLimitError"
    this.path = path
  }
}
