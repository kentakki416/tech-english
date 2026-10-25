import { ALLOWED_LICENSES, SOURCE_FETCH_TYPES, SOURCE_KINDS } from "../const/source"
import type { AllowedLicense, Source, SourceCollectability, SourceFetchType, SourceKind } from "../types/source"

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
 * ソースを収集できるか確かめる（無い・サイト・無効）。
 * api（依頼を 404 / 400 にする）と worker（収集を始める前に確かめる）が同じ条件で判定するため、ここに 1 か所だけ置く
 */
export const checkSourceCollectability = (source: Source | null): SourceCollectability => {
  if (source === null) return { isCollectable: false, reason: "not_found" }
  if (source.fetchType === "website") return { isCollectable: false, reason: "website" }
  if (!source.isEnabled) return { isCollectable: false, reason: "disabled" }
  return { isCollectable: true, source }
}
