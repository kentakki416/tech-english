import {
  EngineNotSupportedException,
  ServiceFailureException,
  TextLengthExceededException,
  ThrottlingException,
  ValidationException,
} from "@aws-sdk/client-polly"

import { isFatalTtsError } from "../../../src/client/polly"

/**
 * SDK がモデル化していないエラー（AWS 共通のエラーコード・資格情報の解決の失敗）は name だけを持つ Error で表す
 */
const createNamedError = (name: string): Error => Object.assign(new Error(`${name} occurred`), { name })

describe("isFatalTtsError", () => {
  describe("正常系", () => {
    it.each([
      ["CredentialsProviderError（資格情報を解決できない）", createNamedError("CredentialsProviderError")],
      ["AccessDeniedException（IAM の権限が無い）", createNamedError("AccessDeniedException")],
      ["UnrecognizedClientException（無効なアクセスキー）", createNamedError("UnrecognizedClientException")],
      ["ExpiredTokenException（期限切れの資格情報）", createNamedError("ExpiredTokenException")],
      ["InvalidSignatureException（署名の誤り）", createNamedError("InvalidSignatureException")],
      ["EngineNotSupportedException（voice と engine の組み合わせ）", new EngineNotSupportedException({ $metadata: {}, message: "x" })],
      ["ValidationException（存在しない voice）", new ValidationException({ $metadata: {}, message: "x", reason: "fieldValidationFailed" })],
    ])("%s は設定の誤り", (_label, error) => {
      expect(isFatalTtsError(error)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each([
      ["ThrottlingException", new ThrottlingException({ $metadata: {}, message: "Rate exceeded" })],
      ["ServiceFailureException（5xx）", new ServiceFailureException({ $metadata: {}, message: "x" })],
      ["TextLengthExceededException", new TextLengthExceededException({ $metadata: {}, message: "x" })],
      ["普通の Error", new Error("boom")],
      ["Error でない値", "AccessDeniedException"],
    ])("%s は 1 件の失敗", (_label, error) => {
      expect(isFatalTtsError(error)).toBe(false)
    })
  })
})
