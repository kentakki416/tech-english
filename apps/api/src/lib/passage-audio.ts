import type { AudioStatus, Passage, PassageAudio } from "@repo/domain"

/**
 * 読み上げの音声の状態と URL（docs/spec/read-aloud/README.md「音声の保存と配信」）
 */

/**
 * 表示する状態（admin と利用者で共通）。ready でも、次のときは本文が変わってマニフェストの位置がずれているかもしれないので pending として扱う。
 *
 * - 問題が公開中でない（非公開に戻した）：published_at は残り、下書きのまま本文を直せるので、updated_at と published_at の比較では
 *   直した後の本文に古いマニフェストが重なってしまう。再公開すると生成タスクが本文の hash を確かめて ready に戻す（本文が同じなら作り直さない）
 * - 音声を作った（または生成タスクが本文の同一を確かめた）後に公開し直された（updated_at < published_at）：生成タスクが次の実行で作り直すか確かめる。
 *   公開し直した直後は、本文が変わっていなくても生成タスクが確かめるまで（最大 1 時間）pending になる
 *
 * voice の変更・作り直しの依頼で生成タスクが ready のまま作り直している間（generation_started_at がある）は、生成タスクが updated_at を進めないので
 * ready のまま前のマニフェストを返す。generating はそのまま返す（admin 向け）。利用者向けには convertToUserAudioStatus で pending にする
 */
export const resolveAudioStatus = (
  audio: Pick<PassageAudio, "manifest" | "status" | "updatedAt"> | null,
  passage: Pick<Passage, "publishedAt" | "status">,
): AudioStatus => {
  if (!audio) return "pending"
  if (audio.status !== "ready") return audio.status
  if (passage.status !== "published") return "pending"
  return audio.manifest && passage.publishedAt && audio.updatedAt >= passage.publishedAt ? "ready" : "pending"
}

/**
 * 利用者には generating も「準備中」と見せる
 */
export const convertToUserAudioStatus = (status: AudioStatus): Exclude<AudioStatus, "generating"> =>
  status === "generating" ? "pending" : status

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
