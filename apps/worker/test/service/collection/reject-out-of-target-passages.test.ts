import { OUT_OF_TARGET_PASSAGE_REJECT_REASON } from "../../../src/const/collection"
import { rejectOutOfTargetPassages } from "../../../src/service/collection"

import { buildSourceDocument, createFakeRepo } from "./helpers"

vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe("rejectOutOfTargetPassages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("collected の本文候補を持つ文書のうち isOutOfTarget に当たるものの collected を、理由つきですべて却下する", async () => {
      const repo = createFakeRepo({
        documentsWithCollectedPassages: [
          buildSourceDocument({ id: 1, path: "docs/a.md" }),
          buildSourceDocument({ id: 2, path: "docs/overview.md" }),
        ],
        rejectedCount: 3,
      })

      await rejectOutOfTargetPassages({ isOutOfTarget: (document) => document.path === "docs/overview.md", sourceId: 1 }, repo)

      expect(repo.sourceDocumentRepository.findWithCollectedPassages).toHaveBeenCalledWith(1)
      expect(repo.passageRepository.rejectCollected).toHaveBeenCalledWith({
        keepContentHashes: [],
        reason: OUT_OF_TARGET_PASSAGE_REJECT_REASON,
        sourceDocumentIds: [2],
      })
    })

    it("当たる文書が無ければ却下しない", async () => {
      const repo = createFakeRepo({ documentsWithCollectedPassages: [buildSourceDocument({ id: 1, path: "docs/a.md" })] })

      await rejectOutOfTargetPassages({ isOutOfTarget: () => false, sourceId: 1 }, repo)

      expect(repo.passageRepository.rejectCollected).not.toHaveBeenCalled()
    })
  })
})
