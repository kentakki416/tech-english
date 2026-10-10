import type { GitHubRepositorySource } from "@repo/domain"
import { logger } from "@repo/logger"

import type { GitHubTreeEntry } from "../../client/github"
import type { ExtractedDocument } from "../../lib/document"

import { extractGitHubFile } from "./extract-github-file"
import { listGitHubTargetFiles } from "./list-github-target-files"
import type { CollectionDeps, CollectionRepo, SourceCollectionResult, SourceCollectionStatus } from "./types"

export type CollectGitHubSourceInput = {
  /**
   * このソースから取得する文書数の上限
   */
  maxDocuments: number
  /**
   * このソースで作る本文候補数の上限（実行全体の残り）
   */
  maxPassages: number
  /**
   * GitHub の rate limit の残りがこれを切ったら打ち切る
   */
  minRateLimitRemaining: number
  now: Date
  source: GitHubRepositorySource
}

/**
 * 文書ごとのループの頭で、打ち切るかどうかを決める。続けるなら null。
 * 上限は文書の単位で判定し、1 文書の本文候補は途中で切らない（切ると blob SHA が記録され、残りが二度と取り込まれないため）
 */
const findStopStatus = (
  progress: { createdPassageCount: number; fetchedDocumentCount: number },
  input: CollectGitHubSourceInput,
  deps: CollectionDeps,
): Exclude<SourceCollectionStatus, "completed" | "up_to_date"> | null => {
  if (deps.isShuttingDown()) return "interrupted"
  if (progress.fetchedDocumentCount >= input.maxDocuments || progress.createdPassageCount >= input.maxPassages) {
    return "limit_reached"
  }
  const remaining = deps.githubContentClient.getRateLimitRemaining()
  if (remaining !== null && remaining < input.minRateLimitRemaining) return "rate_limited"
  return null
}

/**
 * 本文を抽出する。壊れた MDX など throw した文書は warn を出して null（本文候補 0 件として扱い、ファイルが変わるまで再試行しない）
 */
const extractFileSafely = (file: GitHubTreeEntry, content: string, sourceId: number): ExtractedDocument | null => {
  try {
    return extractGitHubFile(file.path, content)
  } catch (error) {
    logger.warn("failed to extract document", {
      error: error instanceof Error ? error.message : String(error),
      path: file.path,
      sourceId,
    })
    return null
  }
}

/**
 * 1 ファイルを取得して本文候補を保存し、作った本文候補の件数を返す。
 * markFetched（blob SHA の記録）は本文候補の挿入の後に呼ぶ。途中で落ちても blob SHA が古いままなので次回やり直され、
 * 挿入済みの本文候補は content_hash の unique で弾かれる（冪等）
 */
const collectFile = async (
  input: { commitSha: string; file: GitHubTreeEntry; now: Date; source: GitHubRepositorySource },
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<number> => {
  const { commitSha, file, now, source } = input
  const content = await deps.githubContentClient.getFileContent(source.repository, file.path, commitSha)
  const extracted = extractFileSafely(file, content, source.id)
  const title = extracted?.title ?? null
  const document = await repo.sourceDocumentRepository.upsertByPath({ path: file.path, sourceId: source.id, title })
  const createdPassageCount = await repo.passageRepository.insertIgnoringDuplicates(
    (extracted?.candidates ?? []).map((candidate) => ({
      blocks: candidate.blocks,
      contentHash: candidate.contentHash,
      sourceCommitSha: commitSha,
      sourceDocumentId: document.id,
      sourcePath: file.path,
      sourceRetrievedAt: now,
      title: candidate.title,
      wordCount: candidate.wordCount,
    })),
  )
  await repo.sourceDocumentRepository.markFetched(document.id, {
    blobSha: file.sha,
    commitSha,
    contentHash: extracted?.contentHash ?? null,
    etag: null,
    fetchedAt: now,
    httpStatus: null,
    lastModified: null,
    title,
  })
  return createdPassageCount
}

/**
 * GitHub リポジトリのソースを 1 つ収集する。
 *
 * 1. 最新コミットの SHA が前回（last_collected_commit_sha）と同じなら up_to_date で終える
 * 2. コミットのツリーから対象のファイルを列挙し、source_documents の blob SHA と比べて新規・変更されたものだけ残す
 * 3. 上限・rate limit・停止指示に掛かるまで、ファイルごとに本文を取得して本文候補を保存する
 * 4. 全件処理でき、ツリーも完全なら completed として commit SHA を記録する（それ以外は記録せず、次回に続きから処理する）
 *
 * 取得元から消えたファイルの source_documents / passages は何もしない（公開済みの問題は残す）
 */
export const collectGitHubSource = async (
  input: CollectGitHubSourceInput,
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<SourceCollectionResult> => {
  const { now, source } = input
  const commitSha = await deps.githubContentClient.getLatestCommitSha(source.repository, source.branch)
  if (commitSha === source.lastCollectedCommitSha) {
    await repo.contentSourceRepository.markCollected(source.id, { lastCollectedAt: now })
    return { createdPassageCount: 0, fetchedDocumentCount: 0, status: "up_to_date" }
  }

  const { files, isComplete } = await listGitHubTargetFiles({ commitSha, source }, deps)
  const documents = await repo.sourceDocumentRepository.findBySourceId(source.id)
  const blobShaByPath = new Map(documents.map((document) => [document.path, document.blobSha]))
  const changedFiles = files.filter((file) => blobShaByPath.get(file.path) !== file.sha)
  logger.info("GitHub source files listed", {
    changedFileCount: changedFiles.length,
    commitSha,
    isComplete,
    sourceId: source.id,
    targetFileCount: files.length,
  })

  const progress = { createdPassageCount: 0, fetchedDocumentCount: 0 }
  let stopStatus: SourceCollectionStatus | null = null
  for (const file of changedFiles) {
    stopStatus = findStopStatus(progress, input, deps)
    if (stopStatus !== null) break
    progress.createdPassageCount += await collectFile({ commitSha, file, now, source }, repo, deps)
    progress.fetchedDocumentCount += 1
  }

  /**
   * ツリーが切り詰められていた場合は、列挙できなかったファイルが残っているので打ち切りと同じに扱う
   */
  const status = stopStatus ?? (isComplete ? "completed" : "limit_reached")
  await repo.contentSourceRepository.markCollected(
    source.id,
    status === "completed" ? { lastCollectedAt: now, lastCollectedCommitSha: commitSha } : { lastCollectedAt: now },
  )
  return { ...progress, status }
}
