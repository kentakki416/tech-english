import path from "node:path"

/**
 * ページとして取得しない拡張子（文書・アーカイブ・画像・動画・音声・スタイル・スクリプト・データ）
 */
const NON_PAGE_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".css",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".m4a",
  ".mjs",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".pdf",
  ".png",
  ".svg",
  ".tar",
  ".tgz",
  ".txt",
  ".wav",
  ".webm",
  ".webp",
  ".xml",
  ".zip",
])

/**
 * ページの URL を正規化する。base を基準に相対 URL を解決し、クエリとフラグメントを除いた `origin + pathname` を返す。
 * 解決できない URL と https 以外は null
 */
export const normalizePageUrl = (raw: string, base: string): string | null => {
  try {
    const url = new URL(raw, base)
    return url.protocol === "https:" ? `${url.origin}${url.pathname}` : null
  } catch {
    return null
  }
}

/**
 * ページとして取得してよいパスか（.pdf / .zip / 画像などのファイルは false）。拡張子の大文字・小文字は区別しない
 */
export const isFetchablePath = (pathname: string): boolean =>
  !NON_PAGE_EXTENSIONS.has(path.posix.extname(pathname).toLowerCase())
