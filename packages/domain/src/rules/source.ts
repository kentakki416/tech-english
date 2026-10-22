import { ALLOWED_LICENSES, SOURCE_FETCH_TYPES, SOURCE_KINDS } from "../const/source"
import type { AllowedLicense, Source, SourceFetchType, SourceKind, SourceNotCollectableReason } from "../types/source"

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
 * 公開してよいライセンスかどうか
 */
export const isAllowedLicense = (value: string): value is AllowedLicense =>
  (ALLOWED_LICENSES as readonly string[]).includes(value)

/**
 * ソースを収集できない理由。収集できるなら null。
 * api（依頼を 404 / 400 にする）と worker（収集を始める前に確かめる）が同じ条件で判定するため、ここに 1 か所だけ置く
 */
export const findSourceNotCollectableReason = (source: Source | null): SourceNotCollectableReason | null => {
  if (source === null) return "not_found"
  if (source.fetchType === "website") return "website"
  if (!source.isEnabled) return "disabled"
  return null
}
