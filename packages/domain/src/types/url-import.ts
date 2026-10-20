import type { URL_IMPORT_CHUNK_STATUSES, URL_IMPORT_ERROR_CODES } from "../const/url-import"

export type UrlImportChunkStatus = (typeof URL_IMPORT_CHUNK_STATUSES)[number]

export type UrlImportErrorCode = (typeof URL_IMPORT_ERROR_CODES)[number]
