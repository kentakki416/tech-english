import request from "supertest"

import type { IGitHubLicenseClient } from "../../../../src/client/github-license"
import { AdminSourceDetailController } from "../../../../src/controller/admin/source/detail"
import { AdminSourceDetectLicenseController } from "../../../../src/controller/admin/source/detect-license"
import { DrizzleSourceRepository } from "../../../../src/repository/drizzle/source-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
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
mountAdminApi(app, adminRouter({
  source: {
    detail: new AdminSourceDetailController(new DrizzleSourceRepository(testDb)),
    detectLicense: new AdminSourceDetectLicenseController(fakeGitHubLicenseClient),
  },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
  vi.clearAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/source/license", () => {
  describe("正常系", () => {
    it.each([
      ["MIT", { is_allowed: true, license_spdx: "MIT" }],
      ["GPL-3.0", { is_allowed: false, license_spdx: "GPL-3.0" }],
      [null, { is_allowed: false, license_spdx: null }],
    ])("GitHub が %s を返すと 200 で検出結果を返す", async (licenseSpdx, expected) => {
      mockDetectLicense.mockResolvedValue(licenseSpdx)

      const res = await request(app)
        .get("/api/admin/source/license")
        .query({ repository: "reactjs/react.dev" })
        .set("Authorization", `Bearer ${adminToken}`)

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
        .get("/api/admin/source/license")
        .query(query)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(mockDetectLicense).not.toHaveBeenCalled()
    })

    it("GitHub の呼び出しが失敗したら 500 を返す", async () => {
      mockDetectLicense.mockRejectedValue(new Error("GitHub license request failed: 403"))

      const res = await request(app)
        .get("/api/admin/source/license")
        .query({ repository: "reactjs/react.dev" })
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(500)
    })

    it("Authorization が無ければ 401 を返し、GitHub を呼ばない", async () => {
      const res = await request(app)
        .get("/api/admin/source/license")
        .query({ repository: "reactjs/react.dev" })

      expect(res.status).toBe(401)
      expect(mockDetectLicense).not.toHaveBeenCalled()
    })
  })
})
