/**
 * クエリ文字列を encodeURIComponent で組み立てる（RN の URLSearchParams の実装差に依存しない）
 */
export const buildQueryString = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
