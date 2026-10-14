import { isLocalCdcDatabaseOf } from "../../../clickhouse/migrate/local-cdc-database"

const POSTGRES = { database: "tech-english_dev", host: "postgres:5432" }

describe("isLocalCdcDatabaseOf", () => {
  describe("正常系", () => {
    it("同じ Postgres（ホストと DB 名）を取り込む MaterializedPostgreSQL なら true", () => {
      const engineFull = "MaterializedPostgreSQL('postgres:5432', 'tech-english_dev', 'postgres', '[HIDDEN]') SETTINGS materialized_postgresql_tables_list = 'users,memos'"

      expect(isLocalCdcDatabaseOf(engineFull, POSTGRES)).toBe(true)
    })
  })

  describe("異常系", () => {
    it("別の DB を取り込んでいる（別プロジェクトの ClickHouse に繋いでいる）なら false", () => {
      const engineFull = "MaterializedPostgreSQL('postgres:5432', 'project-template_dev', 'postgres', '[HIDDEN]') SETTINGS materialized_postgresql_tables_list = 'users,memos'"

      expect(isLocalCdcDatabaseOf(engineFull, POSTGRES)).toBe(false)
    })

    it("別のホストを取り込んでいるなら false", () => {
      const engineFull = "MaterializedPostgreSQL('db.example.com:5432', 'tech-english_dev', 'postgres', '[HIDDEN]')"

      expect(isLocalCdcDatabaseOf(engineFull, POSTGRES)).toBe(false)
    })

    it("MaterializedPostgreSQL でない database なら false", () => {
      expect(isLocalCdcDatabaseOf("Atomic", POSTGRES)).toBe(false)
    })
  })
})
