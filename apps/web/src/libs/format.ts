/**
 * 画面の数値・時間の書式。Client Component からも使うので `server-only` を付けない
 */

/**
 * 秒を `m:ss` にする（負の値は `-m:ss`）
 */
export const formatSeconds = (totalSeconds: number): string => {
  const sign = totalSeconds < 0 ? "-" : ""
  const abs = Math.abs(totalSeconds)
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`
}
