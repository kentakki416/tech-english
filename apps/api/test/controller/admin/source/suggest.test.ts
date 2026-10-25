import request from "supertest"

import type { IGitHubRepositoryClient } from "../../../../src/client/github-repository"
import { AdminSourceDetailController } from "../../../../src/controller/admin/source/detail"
import { AdminSourceSuggestController } from "../../../../src/controller/admin/source/suggest"
import { DrizzleSourceCollectionRunRepository } from "../../../../src/repository/drizzle/source-collection-run-repository"
import { DrizzleSourceRepository } from "../../../../src/repository/drizzle/source-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import type { SourceWritePolicy } from "../../../../src/service/source-service"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

/**
 * 外部 SaaS（GitHub）だけを fake にする
 */
const mockDetectLicense = vi.fn<IGitHubRepositoryClient["detectLicense"]>()
const mockFindRepository = vi.fn<IGitHubRepositoryClient["findRepository"]>()
const fakeGitHubRepositoryClient: IGitHubRepositoryClient = { detectLicense: mockDetectLicense, findRepository: mockFindRepository }

const LICENSE_FILE_URL = "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md"

const LEARN_URL = "https://github.com/reactjs/react.dev/tree/main/src/content/learn"

/**
 * サイトを受け付けるか（ローカルか）をテストごとに切り替える
 */
const policy: SourceWritePolicy = { isWebsiteSourceAllowed: true }

const app = createTestApp()

/**
 * /suggestion が /:id に吸われないことも確かめるため、詳細のコントローラーも登録する
 */
mountAdminApi(app, adminRouter({
  source: {
    detail: new AdminSourceDetailController(new DrizzleSourceRepository(testDb), new DrizzleSourceCollectionRunRepository(testDb)),
    suggest: new AdminSourceSuggestController(fakeGitHubRepositoryClient, policy),
  },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

const requestSuggestion = (query: Record<string, string>) =>
  request(app)
    .get("/api/admin/source/suggestion")
    .query(query)
    .set("Authorization", `Bearer ${adminToken}`)

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
  vi.clearAllMocks()
  policy.isWebsiteSourceAllowed = true
  mockFindRepository.mockResolvedValue({ defaultBranch: "main", fullName: "reactjs/react.dev" })
  mockDetectLicense.mockResolvedValue({ licenseSpdx: "CC-BY-4.0", licenseUrl: LICENSE_FILE_URL })
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/source/suggestion", () => {
  describe("正常系", () => {
    it("GitHub のディレクトリの URL なら 200 でリポジトリ・ブランチ・対象パス・検出したライセンスを返す", async () => {
      const res = await requestSuggestion({ url: LEARN_URL })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        branch: "main",
        default_branch: "main",
        detected_license: { is_allowed: true, license_spdx: "CC-BY-4.0", license_url: LICENSE_FILE_URL },
        fetch_type: "github_repository",
        include_globs: ["src/content/learn/**"],
        repository: "reactjs/react.dev",
      })
    })

    it("ローカルでサイトの URL なら 200 でサイトの URL・対象パス・個人の学習用を返す", async () => {
      const res = await requestSuggestion({ url: "https://go.dev/doc/" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        fetch_type: "website",
        include_globs: ["/doc/**"],
        license_spdx: "LicenseRef-personal-use",
        license_url: "https://go.dev",
        site_url: "https://go.dev",
      })
      expect(mockFindRepository).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it.each([
      ["url が無い", {}],
      ["URL でない", { url: "react.dev" }],
      ["http / https でない", { url: "ftp://github.com/reactjs/react.dev" }],
    ])("%s なら 400 を返し、GitHub を呼ばない", async (_label, query) => {
      const res = await requestSuggestion(query)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(mockFindRepository).not.toHaveBeenCalled()
    })

    it("github.com の URL にリポジトリが無ければ 400 と not_repository_url を返す", async () => {
      const res = await requestSuggestion({ url: "https://github.com/reactjs" })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        details: [{ code: "not_repository_url", message: expect.any(String), path: ["url"] }],
        error: expect.any(String),
        status_code: 400,
      })
    })

    it("GitHub にリポジトリが無ければ 400 と repository_not_found を返す", async () => {
      mockFindRepository.mockResolvedValue(null)

      const res = await requestSuggestion({ url: LEARN_URL })

      expect(res.status).toBe(400)
      expect(res.body.details).toEqual([{ code: "repository_not_found", message: expect.any(String), path: ["url"] }])
    })

    it("ローカル以外でサイトの URL なら 400 と website_unavailable を返す", async () => {
      policy.isWebsiteSourceAllowed = false

      const res = await requestSuggestion({ url: "https://go.dev/doc/" })

      expect(res.status).toBe(400)
      expect(res.body.details).toEqual([{ code: "website_unavailable", message: expect.any(String), path: ["url"] }])
    })

    it("GitHub の呼び出しが失敗したら 500 を返す", async () => {
      mockFindRepository.mockRejectedValue(new Error("GitHub repository request failed: 403"))

      const res = await requestSuggestion({ url: LEARN_URL })

      expect(res.status).toBe(500)
    })

    it("Authorization が無ければ 401 を返し、GitHub を呼ばない", async () => {
      const res = await request(app)
        .get("/api/admin/source/suggestion")
        .query({ url: LEARN_URL })

      expect(res.status).toBe(401)
      expect(mockFindRepository).not.toHaveBeenCalled()
    })
  })
})
