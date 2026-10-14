import type { PassageStatus } from "@repo/domain"

import { updateAdminPassage } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail, buildEditInput, buildPassage } from "../../fixture/passage-content"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

describe("updateAdminPassage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.updateDraftContent.mockResolvedValue(true)
  })

  describe("正常系", () => {
    it("下書きの内容を updateDraftContent に渡し、保存後の詳細を返す", async () => {
      const detail = buildAdminPassageDetail()
      const updated = buildAdminPassageDetail({ passage: buildPassage({ title: "Effects" }) })
      passageRepository.findAdminDetail.mockResolvedValueOnce(detail).mockResolvedValueOnce(updated)
      const input = { ...buildEditInput(detail), title: "Effects" }

      const result = await updateAdminPassage(1, input, { passageRepository })

      expect(result).toEqual({ ok: true, value: updated })
      expect(passageRepository.updateDraftContent).toHaveBeenCalledWith(1, expect.objectContaining({
        blocks: detail.passage.blocks,
        difficulty: 2,
        timeLimitSeconds: 180,
        title: "Effects",
      }))
      expect(passageRepository.findAdminDetail).toHaveBeenCalledTimes(2)
    })

    it.each([
      ["削除", (input: ReturnType<typeof buildEditInput>) => ({ ...input, questions: input.questions.slice(0, 2) })],
      ["追加", (input: ReturnType<typeof buildEditInput>) => ({ ...input, questions: [...input.questions, { ...input.questions[1], id: null }] })],
    ])("挑戦が 0 件なら設問の%sができる", async (_label, edit) => {
      const detail = buildAdminPassageDetail({ attemptCount: 0 })
      passageRepository.findAdminDetail.mockResolvedValue(detail)

      const result = await updateAdminPassage(1, edit(buildEditInput(detail)), { passageRepository })

      expect(result.ok).toBe(true)
      expect(passageRepository.updateDraftContent).toHaveBeenCalledTimes(1)
    })

    it("挑戦がある問題でも、設問の id の集合が同じなら並べ替えと文面の修正ができる", async () => {
      const detail = buildAdminPassageDetail({ attemptCount: 2 })
      passageRepository.findAdminDetail.mockResolvedValue(detail)
      const input = buildEditInput(detail)

      const result = await updateAdminPassage(
        1,
        { ...input, questions: [{ ...input.questions[1], prompt: "Where should it go?" }, input.questions[0], input.questions[2]] },
        { passageRepository },
      )

      expect(result.ok).toBe(true)
      expect(passageRepository.updateDraftContent).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await updateAdminPassage(1, buildEditInput(buildAdminPassageDetail()), { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })

    it.each<PassageStatus>(["collected", "generating", "published", "rejected", "failed"])("%s なら 409 を返す", async (status) => {
      const detail = buildAdminPassageDetail({ passage: buildPassage({ status }) })
      passageRepository.findAdminDetail.mockResolvedValue(detail)

      const result = await updateAdminPassage(1, buildEditInput(detail), { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.updateDraftContent).not.toHaveBeenCalled()
    })

    it.each([
      ["1 つ消す", (input: ReturnType<typeof buildEditInput>) => input.questions.slice(0, 2)],
      ["1 つ足す", (input: ReturnType<typeof buildEditInput>) => [...input.questions, { ...input.questions[1], id: null }]],
      ["別の id にする", (input: ReturnType<typeof buildEditInput>) => [input.questions[0], input.questions[1], { ...input.questions[2], id: 999 }]],
      ["新規に差し替える", (input: ReturnType<typeof buildEditInput>) => [input.questions[0], input.questions[1], { ...input.questions[2], id: null }]],
      ["同じ id を 2 回使う", (input: ReturnType<typeof buildEditInput>) => [input.questions[0], input.questions[1], input.questions[1]]],
    ])("挑戦がある問題で設問を%sと 409 を返す", async (_label, editQuestions) => {
      const detail = buildAdminPassageDetail({ attemptCount: 1 })
      passageRepository.findAdminDetail.mockResolvedValue(detail)
      const input = buildEditInput(detail)

      const result = await updateAdminPassage(1, { ...input, questions: editQuestions(input) }, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.updateDraftContent).not.toHaveBeenCalled()
    })

    it("ブロックの数が違えば 400 と details を返す", async () => {
      const detail = buildAdminPassageDetail()
      passageRepository.findAdminDetail.mockResolvedValue(detail)
      const input = buildEditInput(detail)

      const result = await updateAdminPassage(1, { ...input, blocks: input.blocks.slice(1) }, { passageRepository })

      expect(result).toEqual({
        error: expect.objectContaining({ details: [expect.objectContaining({ code: "block_count_mismatch" })], statusCode: 400, type: "BAD_REQUEST" }),
        ok: false,
      })
      expect(passageRepository.updateDraftContent).not.toHaveBeenCalled()
    })

    it("リクエストの設問 id が既存に無ければ 400 と details を返す（挑戦が 0 件）", async () => {
      const detail = buildAdminPassageDetail()
      passageRepository.findAdminDetail.mockResolvedValue(detail)
      const input = buildEditInput(detail)

      const result = await updateAdminPassage(
        1,
        { ...input, questions: [input.questions[0], input.questions[1], { ...input.questions[2], id: 999 }] },
        { passageRepository },
      )

      expect(result).toEqual({
        error: expect.objectContaining({ details: [expect.objectContaining({ code: "question_id_not_found" })], statusCode: 400, type: "BAD_REQUEST" }),
        ok: false,
      })
    })

    it("用語集の語句が本文から消えると 400 と details を返す", async () => {
      const detail = buildAdminPassageDetail()
      passageRepository.findAdminDetail.mockResolvedValue(detail)
      const input = buildEditInput(detail)
      input.blocks[4] = { ...input.blocks[4], text: "You can skip re-running an Effect." }

      const result = await updateAdminPassage(1, input, { passageRepository })

      expect(result).toEqual({
        error: expect.objectContaining({ details: [expect.objectContaining({ code: "glossary_surface_not_found" })], statusCode: 400 }),
        ok: false,
      })
    })

    it("updateDraftContent が false（保存の前に状態が変わった）なら 409 を返す", async () => {
      const detail = buildAdminPassageDetail()
      passageRepository.findAdminDetail.mockResolvedValue(detail)
      passageRepository.updateDraftContent.mockResolvedValue(false)

      const result = await updateAdminPassage(1, buildEditInput(detail), { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
