/**
 * 音声合成（Polly）の、どの問題でも同じように失敗する設定の誤りのエラーの name（SDK のエラーは name にエラーコードが入る）
 *
 * - 資格情報を解決できない（`CredentialsProviderError`。@smithy の資格情報の解決の失敗。S3 でも同じ）
 * - 資格情報が無効・期限切れ・署名の誤り（`UnrecognizedClientException` / `InvalidSignatureException` / `ExpiredTokenException` など）
 * - IAM の権限が無い（`AccessDeniedException`。タスクロールに `polly:SynthesizeSpeech` が無い）
 * - voice と engine の組み合わせ・言語が不正（`EngineNotSupportedException` / `LanguageNotSupportedException`）
 * - リクエストの値が不正（`ValidationException`。`TTS_VOICE_ID` が存在しない voice のとき）
 *
 * throttling・5xx（`ServiceFailureException`）・`TextLengthExceededException` は 1 件の失敗として扱う（含めない）
 */
const FATAL_TTS_ERROR_NAMES = [
  "AccessDeniedException",
  "CredentialsProviderError",
  "EngineNotSupportedException",
  "ExpiredTokenException",
  "IncompleteSignatureException",
  "InvalidClientTokenId",
  "InvalidSignatureException",
  "LanguageNotSupportedException",
  "MissingAuthenticationTokenException",
  "UnrecognizedClientException",
  "ValidationException",
] as const

/**
 * mp3 の保存先（S3 の PutObject・DeleteObject）の、どの問題でも同じように失敗する設定の誤りのエラーの name（S3 のエラーコード）
 *
 * - IAM・bucket policy の権限が無い（`AccessDenied`。タスクロールに `s3:PutObject` / `s3:DeleteObject` が無い）
 * - bucket が無い（`NoSuchBucket`。`AUDIO_STORAGE_S3_BUCKET` の誤り）
 * - 資格情報が無効・署名の誤り・期限切れ（`InvalidAccessKeyId` / `SignatureDoesNotMatch` / `ExpiredToken`）
 * - bucket のリージョンが `AWS_REGION` と違う（`PermanentRedirect` / `AuthorizationHeaderMalformed`）
 *
 * 5xx（`InternalError` / `SlowDown` など）やローカルの保存先の失敗（ENOSPC など）は 1 件の失敗として扱う（含めない）
 */
const FATAL_STORAGE_ERROR_NAMES = [
  "AccessDenied",
  "AuthorizationHeaderMalformed",
  "ExpiredToken",
  "InvalidAccessKeyId",
  "NoSuchBucket",
  "PermanentRedirect",
  "SignatureDoesNotMatch",
] as const

const FATAL_AUDIO_GENERATION_ERROR_NAMES: ReadonlySet<string> = new Set([...FATAL_STORAGE_ERROR_NAMES, ...FATAL_TTS_ERROR_NAMES])

/**
 * 音声の生成（音声合成・mp3 の保存・使わなくなった mp3 の削除）で、再試行しても直らない設定の誤りか。
 * true なら生成タスクは失敗回数を増やさずに確保を戻して止める（全件が failed にならないように。保存の失敗は Polly の料金もかかるので早く止める）
 */
export const isFatalAudioGenerationError = (error: unknown): error is Error =>
  error instanceof Error && FATAL_AUDIO_GENERATION_ERROR_NAMES.has(error.name)
