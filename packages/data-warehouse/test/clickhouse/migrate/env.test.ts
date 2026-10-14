import { forTesting } from "../../../clickhouse/migrate/env"

const { envSchema } = forTesting

describe("envSchema", () => {
  describe("正常系", () => {
    it("何も指定しなければローカルの docker compose 向けの値になる", () => {
      const result = envSchema.parse({})

      expect(result.DATA_WAREHOUSE_CDC).toBe("materialized_postgresql")
      expect(result.DATA_WAREHOUSE_URL).toBe("http://localhost:8124")
    })

    it("ClickHouse Cloud（https）に clickpipes で繋げる", () => {
      expect(
        envSchema.safeParse({ DATA_WAREHOUSE_CDC: "clickpipes", DATA_WAREHOUSE_URL: "https://abc.ap-northeast-1.aws.clickhouse.cloud:8443" }).success,
      ).toBe(true)
    })
  })

  describe("異常系", () => {
    it("https の ClickHouse に materialized_postgresql（ローカル用で pg_cdc を作り直す）を使えない", () => {
      expect(
        envSchema.safeParse({ DATA_WAREHOUSE_URL: "https://abc.ap-northeast-1.aws.clickhouse.cloud:8443" }).success,
      ).toBe(false)
    })

    it("URL として読めない DATA_WAREHOUSE_URL は、例外を投げずに検証のエラーとして返す", () => {
      expect(envSchema.safeParse({ DATA_WAREHOUSE_URL: "foo" }).success).toBe(false)
    })

    it("database 名は識別子として安全な名前に限る", () => {
      expect(envSchema.safeParse({ DATA_WAREHOUSE_DATABASE: "a\"; DROP DATABASE x" }).success).toBe(false)
    })
  })
})
