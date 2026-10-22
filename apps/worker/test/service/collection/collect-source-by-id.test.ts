import { EXTRACTION_VERSION } from "@repo/content-extractor"

import { collectSourceById, SourceNotCollectableError } from "../../../src/service/collection"

import {
  buildGitHubSource,
  buildWebsiteSource,
  COMMIT_SHA,
  createDeps,
  createFakeGitHubClient,
  createFakeRepo,
  NOW,
} from "./helpers"

const INPUT = { githubMinRateLimitRemaining: 10, maxDocuments: 100, maxPassages: 200, now: NOW, sourceId: 1 }

describe("collectSourceById", () => {
  describe("正常系", () => {
    it("有効な GitHub のソースを収集する（前回と同じコミット・抽出の版なら up_to_date）", async () => {
      const source = buildGitHubSource({ id: 1, lastCollectedCommitSha: COMMIT_SHA, lastCollectedExtractionVersion: EXTRACTION_VERSION })
      const repo = createFakeRepo({ source })
      const github = createFakeGitHubClient()

      const result = await collectSourceById(INPUT, repo, createDeps(github))

      expect(repo.sourceRepository.findById).toHaveBeenCalledWith(1)
      expect(github.getLatestCommitSha).toHaveBeenCalledWith(source.repository, source.branch)
      expect(result).toEqual({ createdPassageCount: 0, fetchedDocumentCount: 0, status: "up_to_date" })
    })
  })

  describe("異常系", () => {
    it.each([
      ["ソースが無い", "not_found", null],
      ["サイトのソース", "website", buildWebsiteSource({ id: 1 })],
      ["無効の GitHub のソース", "disabled", buildGitHubSource({ id: 1, isEnabled: false })],
    ] as const)("%s なら reason が %s の SourceNotCollectableError を throw し、GitHub API を呼ばない", async (_label, reason, source) => {
      const repo = createFakeRepo({ source })
      const github = createFakeGitHubClient()

      await expect(collectSourceById(INPUT, repo, createDeps(github))).rejects.toMatchObject({
        name: SourceNotCollectableError.name,
        reason,
      })
      expect(github.getLatestCommitSha).not.toHaveBeenCalled()
    })
  })
})
