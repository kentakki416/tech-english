import {
  EngineNotSupportedException,
  ServiceFailureException,
  TextLengthExceededException,
  ThrottlingException,
  ValidationException,
} from "@aws-sdk/client-polly"

import { isFatalAudioGenerationError } from "../../../src/lib/audio"

/**
 * SDK がモデル化していないエラー（AWS 共通のエラーコード・資格情報の解決の失敗・S3 のエラーコード）は name だけを持つ Error で表す
 * （S3 の SDK はエラーコードを name にした S3ServiceException を投げる。cron は @aws-sdk/client-s3 に直接依存しないので name だけで表す）
 */
const createNamedError = (name: string): Error => Object.assign(new Error(`${name} occurred`), { name })

describe("isFatalAudioGenerationError", () => {
  describe("正常系", () => {
    it.each([
      ["CredentialsProviderError（資格情報を解決できない）", createNamedError("CredentialsProviderError")],
      ["AccessDeniedException（IAM の権限が無い）", createNamedError("AccessDeniedException")],
      ["UnrecognizedClientException（無効なアクセスキー）", createNamedError("UnrecognizedClientException")],
      ["ExpiredTokenException（期限切れの資格情報）", createNamedError("ExpiredTokenException")],
      ["InvalidSignatureException（署名の誤り）", createNamedError("InvalidSignatureException")],
      ["EngineNotSupportedException（voice と engine の組み合わせ）", new EngineNotSupportedException({ $metadata: {}, message: "x" })],
      ["ValidationException（存在しない voice）", new ValidationException({ $metadata: {}, message: "x", reason: "fieldValidationFailed" })],
    ])("音声合成の %s は設定の誤り", (_label, error) => {
      expect(isFatalAudioGenerationError(error)).toBe(true)
    })

    it.each([
      ["AccessDenied（s3:PutObject / s3:DeleteObject の権限が無い）", createNamedError("AccessDenied")],
      ["InvalidAccessKeyId（無効なアクセスキー）", createNamedError("InvalidAccessKeyId")],
      ["SignatureDoesNotMatch（署名の誤り）", createNamedError("SignatureDoesNotMatch")],
      ["ExpiredToken（期限切れの資格情報）", createNamedError("ExpiredToken")],
      ["PermanentRedirect（bucket のリージョンが違う）", createNamedError("PermanentRedirect")],
      ["AuthorizationHeaderMalformed（bucket のリージョンが違う）", createNamedError("AuthorizationHeaderMalformed")],
      ["NoSuchBucket（bucket が無い）", createNamedError("NoSuchBucket")],
    ])("保存先の %s は設定の誤り", (_label, error) => {
      expect(isFatalAudioGenerationError(error)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each([
      ["ThrottlingException", new ThrottlingException({ $metadata: {}, message: "Rate exceeded" })],
      ["ServiceFailureException（5xx）", new ServiceFailureException({ $metadata: {}, message: "x" })],
      ["TextLengthExceededException", new TextLengthExceededException({ $metadata: {}, message: "x" })],
      ["S3 の InternalError（5xx）", createNamedError("InternalError")],
      ["S3 の SlowDown（throttling）", createNamedError("SlowDown")],
      ["ローカルの保存先の ENOSPC", Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" })],
      ["普通の Error", new Error("boom")],
      ["Error でない値", "AccessDenied"],
    ])("%s は 1 件の失敗", (_label, error) => {
      expect(isFatalAudioGenerationError(error)).toBe(false)
    })
  })
})
