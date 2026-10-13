/**
 * Polly の 1 リクエストの上限（課金対象の文字数）。これを超えるブロックは文の区切りで複数のパートに分ける
 */
export const POLLY_MAX_BILLED_CHARACTERS = 3000

/**
 * 読み上げ用テキストの作り方の版。作り方（インラインコードの扱い・読み上げないブロックの判定など）を変えたら上げる。
 * 本文のハッシュ（text_hash）に含めるが、上げただけでは既存の ready の音声は作り直さない（生成タスクは ready の行を
 * 公開し直し・voice の変更のときしか確保しないため）。作り直すには、デプロイの後に
 * `UPDATE passage_audios SET status = 'pending' WHERE status = 'ready'` を流す（次の実行から AUDIO_MAX_PASSAGES_PER_RUN 件ずつ作り直す。
 * その間は利用者に「準備中」と見える。本文・voice・版が同じでハッシュが変わらない行は Polly を呼ばずに ready に戻る）
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
