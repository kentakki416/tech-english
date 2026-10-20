import { IN_USE_PASSAGE_STATUSES, SUPERSEDED_PASSAGE_REJECT_REASON } from "../../../src/const/collection"
import type { PassageChunk } from "../../../src/lib/document"
import { savePassageCandidates } from "../../../src/service/collection"

import { createFakeRepo, NOW } from "./helpers"

vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const buildCandidate = (title: string): PassageChunk => ({
  blocks: [{ text: `${title} text.`, type: "paragraph" }],
  contentHash: `hash-${title}`,
  rejectReasons: [],
  title,
  wordCount: 250,
})

const buildInput = (candidates: PassageChunk[]) => ({
  candidates,
  documentId: 10,
  now: NOW,
  sourceCommitSha: "commit-sha",
  sourceId: 1,
  sourcePath: "docs/a.md",
})

describe("savePassageCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("同じ見出しの下書き・公開済み・生成中がある塊は挿入せず、残りを挿入して、挿入した塊に無い collected を却下する", async () => {
      const repo = createFakeRepo({ inUseTitles: ["Alpha"] })

      const createdPassageCount = await savePassageCandidates(
        buildInput([buildCandidate("Alpha"), buildCandidate("Beta")]),
        repo,
      )

      expect(createdPassageCount).toBe(1)
      expect(repo.passageRepository.findTitles).toHaveBeenCalledWith({ sourceDocumentId: 10, statuses: IN_USE_PASSAGE_STATUSES })
      expect(repo.passageRepository.insertIgnoringDuplicates).toHaveBeenCalledWith([{
        blocks: [{ text: "Beta text.", type: "paragraph" }],
        contentHash: "hash-Beta",
        sourceCommitSha: "commit-sha",
        sourceDocumentId: 10,
        sourcePath: "docs/a.md",
        sourceRetrievedAt: NOW,
        title: "Beta",
        wordCount: 250,
      }])
      expect(repo.passageRepository.rejectCollected).toHaveBeenCalledWith({
        keepContentHashes: ["hash-Beta"],
        reason: SUPERSEDED_PASSAGE_REJECT_REASON,
        sourceDocumentIds: [10],
      })
    })

    it("すべての塊の見出しに下書きがあれば何も挿入せず、その文書の collected をすべて却下する", async () => {
      const repo = createFakeRepo({ inUseTitles: ["Alpha"] })

      const createdPassageCount = await savePassageCandidates(buildInput([buildCandidate("Alpha")]), repo)

      expect(createdPassageCount).toBe(0)
      expect(repo.passageRepository.insertIgnoringDuplicates).toHaveBeenCalledWith([])
      expect(repo.passageRepository.rejectCollected).toHaveBeenCalledWith(expect.objectContaining({ keepContentHashes: [] }))
    })
  })

  describe("異常系", () => {
    it("挿入で throw したら却下しない", async () => {
      const repo = createFakeRepo()
      repo.passageRepository.insertIgnoringDuplicates.mockRejectedValueOnce(new Error("db connection failed"))

      await expect(savePassageCandidates(buildInput([buildCandidate("Alpha")]), repo)).rejects.toThrow("db connection failed")
      expect(repo.passageRepository.rejectCollected).not.toHaveBeenCalled()
    })
  })
})
