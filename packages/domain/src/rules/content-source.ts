import { ALLOWED_LICENSES, SOURCE_FETCH_TYPES, SOURCE_KINDS } from "../const/content-source"
import type { AllowedLicense, SourceFetchType, SourceKind } from "../types/content-source"

/**
 * ソースの種別の値かどうか
 */
export const isSourceKind = (value: string): value is SourceKind =>
  (SOURCE_KINDS as readonly string[]).includes(value)

/**
 * ソースの取得方法の値かどうか
 */
export const isSourceFetchType = (value: string): value is SourceFetchType =>
  (SOURCE_FETCH_TYPES as readonly string[]).includes(value)

/**
 * 登録を許可するライセンスかどうか
 */
export const isAllowedLicense = (value: string): value is AllowedLicense =>
  (ALLOWED_LICENSES as readonly string[]).includes(value)
