import { selectTagColor, type Tag, type TagColor } from "@repo/domain"
import { conflictError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { TagInput, TagRepository, TagWithSourceCount } from "../repository"

type TagRepo = { tagRepository: TagRepository }

const DUPLICATE_TAG_MESSAGE = "Tag already exists"

/**
 * タグの作成の入力。color が null なら自動で割り当てる
 */
export type CreateTagInput = { color: TagColor | null; name: string }

export const getTags = async (repo: TagRepo): Promise<Result<TagWithSourceCount[]>> =>
  ok(await repo.tagRepository.findAll())

/**
 * タグを作る。色の指定が無ければ、今いちばん使われていない色を割り当てる。
 * 2 つのリクエストが同時に来ると同じ色になりうるが、色は識別に使わないので許す（ロックは取らない）
 */
export const createTag = async (input: CreateTagInput, repo: TagRepo): Promise<Result<Tag>> => {
  const color = input.color ?? selectTagColor(await repo.tagRepository.findColors())
  /**
   * 重複の事前の検査はしない。lower(name) の unique index が同時のリクエストも含めて止める
   */
  const result = await repo.tagRepository.create({ color, name: input.name })
  if (result.kind === "duplicate") {
    logger.debug("TagService: Tag already exists")
    return err(conflictError(DUPLICATE_TAG_MESSAGE))
  }
  logger.info("TagService: Tag created", { color, id: result.tag.id })
  return ok(result.tag)
}

/**
 * タグの名前と色を変える。名前の変更は、このタグを付けたすべてのソースに反映される
 */
export const updateTag = async (id: number, input: TagInput, repo: TagRepo): Promise<Result<Tag>> => {
  const result = await repo.tagRepository.update(id, input)
  if (result.kind === "not_found") {
    logger.debug("TagService: Tag not found for update", { id })
    return err(notFoundError("Tag not found"))
  }
  if (result.kind === "duplicate") {
    logger.debug("TagService: Tag already exists", { id })
    return err(conflictError(DUPLICATE_TAG_MESSAGE))
  }
  logger.info("TagService: Tag updated", { id })
  return ok(result.tag)
}

/**
 * タグを消す。付けていたソースからも外れる（content_source_tags の CASCADE）
 */
export const deleteTag = async (id: number, repo: TagRepo): Promise<Result<{ deleted: true }>> => {
  if (!(await repo.tagRepository.delete(id))) {
    logger.debug("TagService: Tag not found for deletion", { id })
    return err(notFoundError("Tag not found"))
  }
  logger.info("TagService: Tag deleted", { id })
  return ok({ deleted: true })
}
