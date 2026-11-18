export const describeAudioError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  const kind = error.name === "Error" ? error.constructor.name : error.name
  return `${kind}: ${error.message}`
}
