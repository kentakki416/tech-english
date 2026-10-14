import { renderViewSql } from "../../../clickhouse/migrate/render-view-sql"

describe("renderViewSql", () => {
  describe("正常系", () => {
    it("${NAME} をすべて置き換える", () => {
      const sql = "SELECT * EXCEPT (${CDC_META_COLUMNS}) FROM ${CDC_DATABASE}.users WHERE ${CDC_LIVE_FILTER}"

      expect(
        renderViewSql(sql, {
          CDC_DATABASE: "pg_cdc",
          CDC_LIVE_FILTER: "_sign = 1",
          CDC_META_COLUMNS: "_sign, _version",
        }),
      ).toBe("SELECT * EXCEPT (_sign, _version) FROM pg_cdc.users WHERE _sign = 1")
    })

    it("変数を含まない SQL はそのまま返す", () => {
      expect(renderViewSql("SELECT 1", {})).toBe("SELECT 1")
    })
  })

  describe("異常系", () => {
    it("未定義の変数があれば throw する", () => {
      expect(() => renderViewSql("SELECT ${UNKNOWN}", {})).toThrow("UNKNOWN")
    })
  })
})
