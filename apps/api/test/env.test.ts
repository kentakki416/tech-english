import { forTesting } from "../src/env"

const { apiEnvSchema } = forTesting

/**
 * JWT の鍵 4 つがすべて別の値の env。ほかの項目は既定値か任意なので、これだけで通る
 */
const VALID_ENV = {
  JWT_ACCESS_SECRET: "access-secret-at-least-32-characters",
  JWT_ADMIN_ACCESS_SECRET: "admin-access-secret-at-least-32-characters",
  JWT_ADMIN_REFRESH_SECRET: "admin-refresh-secret-at-least-32-characters",
  JWT_REFRESH_SECRET: "refresh-secret-at-least-32-characters",
}

describe("apiEnvSchema", () => {
  describe("正常系", () => {
    it("JWT の鍵 4 つがすべて別の値なら通る", () => {
      expect(apiEnvSchema.safeParse(VALID_ENV).success).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each([
      ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"],
      ["JWT_ACCESS_SECRET", "JWT_ADMIN_ACCESS_SECRET"],
      ["JWT_ACCESS_SECRET", "JWT_ADMIN_REFRESH_SECRET"],
      ["JWT_REFRESH_SECRET", "JWT_ADMIN_ACCESS_SECRET"],
      ["JWT_REFRESH_SECRET", "JWT_ADMIN_REFRESH_SECRET"],
      ["JWT_ADMIN_ACCESS_SECRET", "JWT_ADMIN_REFRESH_SECRET"],
    ] as const)("%s と %s が同じ値なら失敗し、どちらかの鍵に custom の issue を 1 つだけ付ける", (first, second) => {
      const result = apiEnvSchema.safeParse({ ...VALID_ENV, [second]: VALID_ENV[first] })

      expect(result.success).toBe(false)
      expect(result.error?.issues).toHaveLength(1)
      expect(result.error?.issues[0].code).toBe("custom")
      expect([first, second]).toContain(result.error?.issues[0].path[0])
    })
  })
})
