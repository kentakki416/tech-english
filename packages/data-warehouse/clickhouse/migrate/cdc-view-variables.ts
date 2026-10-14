import type { CdcMode } from "./env"

/**
 * CDC の取り込み先の database。ClickPipe の出力先もローカルと同じ名前にする。
 */
export const CDC_DATABASE = "pg_cdc"

/**
 * CDC の実装ごとに view の SQL へ埋める値。
 *
 * view の名前・列・型を環境間で揃え、定義だけを変えるためのもの。
 * none は view を作らないので持たない。
 *
 * - メタ列は `SELECT * EXCEPT (...)` で view から外す
 * - 削除は、MaterializedPostgreSQL は `_sign = -1`、ClickPipes は `_peerdb_is_deleted = 1` の行で表される
 */
export const CDC_VIEW_VARIABLES: Record<Exclude<CdcMode, "none">, Record<string, string>> = {
  clickpipes: {
    CDC_DATABASE,
    CDC_LIVE_FILTER: "_peerdb_is_deleted = 0",
    CDC_META_COLUMNS: "_peerdb_synced_at, _peerdb_is_deleted, _peerdb_version",
  },
  materialized_postgresql: {
    CDC_DATABASE,
    CDC_LIVE_FILTER: "_sign = 1",
    CDC_META_COLUMNS: "_sign, _version",
  },
}
