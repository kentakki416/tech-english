import request from "supertest"

import type { IGitHubLicenseClient } from "../../../../src/client/github-license"
import { AdminContentSourceDetailController } from "../../../../src/controller/admin/content-source/detail"
import { AdminContentSourceDetectLicenseController } from "../../../../src/controller/admin/content-source/detect-license"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleContentSourceRepository } from "../../../../src/repository/drizzle/content-source-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

/**
 * 外部 SaaS（GitHub）だけを fake にする
 */
const mockDetectLicense = vi.fn<IGitHubLicenseClient["detectLicense"]>()
const fakeGitHubLicenseClient: IGitHubLicenseClient = { detectLicense: mockDetectLicense }

const app = createTestApp()

/**
 * /license が /:id に吸われないことも確かめるため、詳細のコントローラーも登録する
 */
app.use("/api/admin", adminRouter({
  contentSource: {
    detail: new AdminContentSourceDetailController(new DrizzleContentSourceRepository(testDb)),
    detectLicense: new AdminContentSourceDetectLicenseController(fakeGitHubLicenseClient),
  },
}))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
  vi.clearAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/content-source/license", () => {
  describe("正常系", () => {
    it.each([
      ["MIT", { is_allowed: true, license_spdx: "MIT" }],
      ["GPL-3.0", { is_allowed: false, license_spdx: "GPL-3.0" }],
      [null, { is_allowed: false, license_spdx: null }],
    ])("GitHub が %s を返すと 200 で検出結果を返す", async (licenseSpdx, expected) => {
      mockDetectLicense.mockResolvedValue(licenseSpdx)

      const res = await request(app)
        .get("/api/admin/content-source/license")
        .query({ repository: "reactjs/react.dev" })
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(expected)
      expect(mockDetectLicense).toHaveBeenCalledWith("reactjs/react.dev")
    })
  })

  describe("異常系", () => {
    it.each([
      ["../etc", { repository: "../etc" }],
      ["owner だけ", { repository: "owner" }],
      ["name が ..", { repository: "owner/.." }],
      ["owner/name/extra", { repository: "owner/name/extra" }],
      ["repository が無い", {}],
    ])("repository が %s なら 400 を返し、GitHub を呼ばない", async (_label, query) => {
      const res = await request(app)
        .get("/api/admin/content-source/license")
        .query(query)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(mockDetectLicense).not.toHaveBeenCalled()
    })

    it("GitHub の呼び出しが失敗したら 500 を返す", async () => {
      mockDetectLicense.mockRejectedValue(new Error("GitHub license request failed: 403"))

      const res = await request(app)
        .get("/api/admin/content-source/license")
        .query({ repository: "reactjs/react.dev" })
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(500)
    })

    it("X-Admin-Token が無ければ 401 を返し、GitHub を呼ばない", async () => {
      const res = await request(app)
        .get("/api/admin/content-source/license")
        .query({ repository: "reactjs/react.dev" })

      expect(res.status).toBe(401)
      expect(mockDetectLicense).not.toHaveBeenCalled()
    })
  })
})
