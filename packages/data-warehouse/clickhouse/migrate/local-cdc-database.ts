const MATERIALIZED_POSTGRESQL_ARGS_PATTERN = /^MaterializedPostgreSQL\('([^']*)',\s*'([^']*)'/

/**
 * system.databases の engine_full が、指定した Postgres（ホストと DB 名）を取り込む
 * MaterializedPostgreSQL かを判定する。
 *
 * ローカルの CDC を作り直す（DROP DATABASE）前に、消そうとしている database が
 * このプロジェクトのものか確かめるために使う。同じテンプレートから作った別プロジェクトの
 * ClickHouse が同じポートで動いていると、接続先を取り違えたまま別プロジェクトの CDC を
 * 消してしまうため。
 */
export const isLocalCdcDatabaseOf = (
  engineFull: string,
  postgres: { database: string, host: string },
): boolean => {
  const match = MATERIALIZED_POSTGRESQL_ARGS_PATTERN.exec(engineFull)
  return match !== null && match[1] === postgres.host && match[2] === postgres.database
}
