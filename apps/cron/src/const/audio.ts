/**
 * Polly の 1 リクエストの上限（課金対象の文字数）。これを超えるブロックは文の区切りで複数のパートに分ける
 */
export const POLLY_MAX_BILLED_CHARACTERS = 3000

/**
 * 読み上げ用テキストの作り方の版。作り方（インラインコードの扱い・読み上げないブロックの判定など）を変えたら上げる。
 * 本文のハッシュ（text_hash）に含めるが、上げただけでは既存の ready の音声は作り直さない（生成タスクは ready の行を
 * 公開し直し・voice の変更・作り直しの依頼のときしか確保しないため）。作り直すには、デプロイの後に作り直しの依頼を入れる
 * （`UPDATE passage_audios SET regenerate_requested_at = timezone('utc', now()), attempt_count = 0, last_error = NULL WHERE status = 'ready'`。
 * 日時の列は UTC なので timezone('utc', ...) にする。updated_at は変えない）。次の実行から AUDIO_MAX_PASSAGES_PER_RUN 件ずつ、
 * ready のまま前の音声を出しながら作り直す
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
