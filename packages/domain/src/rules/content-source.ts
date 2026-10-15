import { ALLOWED_LICENSES, SOURCE_FETCH_TYPES, SOURCE_KINDS } from "../const/content-source"
import type { AllowedLicense, SourceFetchType, SourceKind } from "../types/content-source"

export const isSourceKind = (value: string): value is SourceKind =>
  (SOURCE_KINDS as readonly string[]).includes(value)

export const isSourceFetchType = (value: string): value is SourceFetchType =>
  (SOURCE_FETCH_TYPES as readonly string[]).includes(value)

export const isAllowedLicense = (value: string): value is AllowedLicense =>
  (ALLOWED_LICENSES as readonly string[]).includes(value)
