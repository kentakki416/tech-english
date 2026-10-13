/**
 * どの問題でも同じように失敗する設定の誤りのエラーの name（SDK のエラーは name にエラーコードが入る）
 *
 * - 資格情報を解決できない（`CredentialsProviderError`。@smithy の資格情報の解決の失敗）
 * - 資格情報が無効・期限切れ・署名の誤り（`UnrecognizedClientException` / `InvalidSignatureException` / `ExpiredTokenException` など）
 * - IAM の権限が無い（`AccessDeniedException`。タスクロールに `polly:SynthesizeSpeech` が無い）
 * - voice と engine の組み合わせ・言語が不正（`EngineNotSupportedException` / `LanguageNotSupportedException`）
 * - リクエストの値が不正（`ValidationException`。`TTS_VOICE_ID` が存在しない voice のとき）
 *
 * throttling・5xx（`ServiceFailureException`）・`TextLengthExceededException` は 1 件の失敗として扱う（false）
 */
const FATAL_TTS_ERROR_NAMES: ReadonlySet<string> = new Set([
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
])

/**
 * 再試行しても直らない設定の誤りか。true なら生成タスクは失敗回数を増やさずに確保を戻して止める（全件が failed にならないように）
 */
export const isFatalTtsError = (error: unknown): boolean =>
  error instanceof Error && FATAL_TTS_ERROR_NAMES.has(error.name)
