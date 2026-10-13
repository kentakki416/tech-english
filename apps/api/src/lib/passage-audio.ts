import type { AudioStatus, PassageAudio } from "@repo/domain"

/**
 * 読み上げの音声の状態と URL（docs/spec/read-aloud/README.md「音声の保存と配信」）。admin と利用者向けの API で共有する
 */

/**
 * 表示する状態（admin と利用者で共通）。ready でも、音声を作った（または生成タスクが本文の同一を確かめた）後に公開し直されていれば、
 * 本文が変わってマニフェストの位置がずれているかもしれないので pending として扱う（生成タスクが次の実行で作り直すか確かめる）。
 * 公開し直した直後は、本文が変わっていなくても生成タスクが確かめるまで（最大 1 時間）pending になる。
 * generating はそのまま返す（admin 向け）。利用者向けには convertToUserAudioStatus で pending にする
 */
export const resolveAudioStatus = (
  audio: Pick<PassageAudio, "manifest" | "status" | "updatedAt"> | null,
  publishedAt: Date | null,
): AudioStatus => {
  if (!audio) return "pending"
  if (audio.status !== "ready") return audio.status
  return audio.manifest && publishedAt && audio.updatedAt >= publishedAt ? "ready" : "pending"
}

/**
 * 利用者には generating も「準備中」と見せる
 */
export const convertToUserAudioStatus = (status: AudioStatus): Exclude<AudioStatus, "generating"> =>
  status === "generating" ? "pending" : status

/**
 * 末尾のスラッシュを除いた base と、先頭のスラッシュを除いたキーをつなぐ
 */
export const buildAudioUrl = (baseUrl: string, key: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`

/**
 * 音声の URL の base。AUDIO_PUBLIC_URL_BASE が無ければ、開発ではローカルの /media（api の mediaRouter）にし、
 * production ではローカルにフォールバックせず null にする（音声 API は pending を返す。infra より先に api を出しても起動を止めない）
 */
export const resolveAudioPublicUrlBase = (input: {
  audioPublicUrlBase: string | undefined
  nodeEnv: string
  port: number
}): string | null => {
  if (input.audioPublicUrlBase) return input.audioPublicUrlBase
  return input.nodeEnv === "production" ? null : `http://localhost:${input.port}/media`
}
