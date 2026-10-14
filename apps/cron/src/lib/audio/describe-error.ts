/**
 * last_error に残す「種類: メッセージ」（generate:audio・generate:word-audio で共有）
 */
export const describeAudioError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  const kind = error.name === "Error" ? error.constructor.name : error.name
  return `${kind}: ${error.message}`
}
