const MATERIALIZED_POSTGRESQL_ARGS_PATTERN = /^MaterializedPostgreSQL\('([^']*)',\s*'([^']*)'/

/**
 * system.databases の engine_full が、指定した Postgres（ホストと DB 名）を取り込む
 * MaterializedPostgreSQL かを判定する。
 *
 * 既にある pg_cdc が、このプロジェクトのものか確かめるために使う（理由は verifyExistingCdcDatabaseIsOwn）。
 */
export const isLocalCdcDatabaseOf = (
  engineFull: string,
  postgres: { database: string, host: string },
): boolean => {
  const match = MATERIALIZED_POSTGRESQL_ARGS_PATTERN.exec(engineFull)
  return match !== null && match[1] === postgres.host && match[2] === postgres.database
}
