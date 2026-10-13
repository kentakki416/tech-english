/**
 * Polly の 1 リクエストの上限（課金対象の文字数）。これを超えるブロックは文の区切りで複数のパートに分ける
 */
export const POLLY_MAX_BILLED_CHARACTERS = 3000

/**
 * 読み上げ用テキストの作り方の版。作り方（インラインコードの扱い・読み上げないブロックの判定など）を変えたら上げる。
 * 本文のハッシュ（text_hash）に含めるので、上げると全問の音声が作り直しになる
 */
export const AUDIO_TEXT_VERSION = 1

/**
 * 音声の mp3 の Cache-Control。キーに本文と voice のハッシュを含めて内容が変わればキーも変わるので、長期・immutable にする
 */
export const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable"

/**
 * Polly の SDK の 1 リクエストの試行回数（初回を含む。SDK の既定と同じ 3）。throttling・5xx は SDK が指数バックオフで再試行する
 */
export const POLLY_MAX_ATTEMPTS = 3
