/**
 * generate:audio の mp3 の保存先を使ってよいか。production の local（コンテナの一時領域）は、タスクが終わると mp3 が消えるのに
 * passage_audios が ready になり、利用者に読み込めない音声を配ってしまうので使わない（production の api は /media も配信しない）
 */
export const isAudioStorageAllowed = (input: { nodeEnv: string; storageType: "local" | "s3" }): boolean =>
  input.nodeEnv !== "production" || input.storageType !== "local"
