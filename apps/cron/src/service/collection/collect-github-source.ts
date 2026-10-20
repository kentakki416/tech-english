import type { GitHubRepositorySource, SourceDocument } from "@repo/domain"
import { logger } from "@repo/logger"

import type { GitHubTreeEntry } from "../../client/github"
import { EXTRACTION_VERSION, type ExtractedDocument } from "../../lib/document"
import { isTargetPath } from "../../lib/path-filter"

import { extractGitHubFile } from "./extract-github-file"
import { listGitHubTargetFiles } from "./list-github-target-files"
import { rejectOutOfTargetPassages } from "./reject-out-of-target-passages"
import { replacePassageCandidates } from "./replace-passage-candidates"
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
): Exclude<SourceCollectionStatus, "completed" | "crawl_delay_too_long" | "throttled" | "up_to_date"> | null => {
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
 * 取得して切り分ける（し直す）ファイルか。未取得、blob SHA が変わった、切り分けたときの抽出の版が今と違う
 */
const isFileToExtract = (file: GitHubTreeEntry, document: SourceDocument | undefined): boolean =>
  document === undefined || document.blobSha !== file.sha || document.extractionVersion !== EXTRACTION_VERSION

/**
 * 1 ファイルを取得して本文候補を保存し、作った本文候補の件数を返す。
 * markFetched（blob SHA・抽出の版の記録）は本文候補の保存の後に呼ぶ。途中で落ちても blob SHA・版が古いままなので次回やり直され、
 * 挿入済みの本文候補は content_hash の unique で弾かれる（冪等）。抽出に失敗したファイルも版を記録する（ファイルか版が変わるまで再試行しない）
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
  const createdPassageCount = extracted === null
    ? 0
    : await replacePassageCandidates({
      candidates: extracted.candidates,
      documentId: document.id,
      now,
      sourceCommitSha: commitSha,
      sourceId: source.id,
      sourcePath: file.path,
    }, repo)
  await repo.sourceDocumentRepository.markFetched(document.id, {
    blobSha: file.sha,
    commitSha,
    contentHash: extracted?.contentHash ?? null,
    etag: null,
    extractionVersion: EXTRACTION_VERSION,
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
 * 1. 最新コミットの SHA と抽出の版が前回（last_collected_commit_sha・last_collected_extraction_version）と同じなら up_to_date で終える
 * 2. コミットのツリーから対象のファイルを列挙し、列挙に無い文書（取得元から消えた・対象パスから外れた）の collected を却下する
 * 3. source_documents の blob SHA・抽出の版と比べて、新規・変更されたものと版が古いものだけ残す
 * 4. 上限・rate limit に掛かるまで、ファイルごとに本文を取得して本文候補を保存する
 * 5. 全件処理でき、ツリーも完全なら completed として commit SHA と抽出の版を記録する（それ以外は記録せず、次回に続きから処理する）。
 *    収集の途中で last_collected_commit_sha が変えられていたら記録しない（楽観ロック）
 *
 * 取得元から消えたファイルの source_documents と、下書き・公開済みの本文候補は残す（公開済みの問題は残す）
 */
export const collectGitHubSource = async (
  input: CollectGitHubSourceInput,
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<SourceCollectionResult> => {
  const { now, source } = input
  const commitSha = await deps.githubContentClient.getLatestCommitSha(source.repository, source.branch)
  if (commitSha === source.lastCollectedCommitSha && source.lastCollectedExtractionVersion === EXTRACTION_VERSION) {
    await repo.contentSourceRepository.markCollected(source.id, { lastCollectedAt: now })
    return { createdPassageCount: 0, fetchedDocumentCount: 0, status: "up_to_date" }
  }

  const { files, isComplete } = await listGitHubTargetFiles({ commitSha, source }, deps)
  const listedPaths = new Set(files.map((file) => file.path))
  /**
   * ツリーが切り詰められていたら、列挙できなかっただけのファイルを消えたとみなさないよう、対象パスから外れた文書だけを却下する
   */
  await rejectOutOfTargetPassages({
    isOutOfTarget: (document) => !listedPaths.has(document.path) && (isComplete || !isTargetPath(document.path, source)),
    sourceId: source.id,
  }, repo)
  const documents = await repo.sourceDocumentRepository.findBySourceId(source.id)
  const documentByPath = new Map(documents.map((document) => [document.path, document]))
  const changedFiles = files.filter((file) => isFileToExtract(file, documentByPath.get(file.path)))
  logger.info("GitHub source files listed", {
    changedFileCount: changedFiles.length,
    commitSha,
    extractionVersion: EXTRACTION_VERSION,
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
  /**
   * commit SHA は、収集を始めたときに読んだ値のままのときだけ書く（楽観ロック）。
   * 収集の途中で admin が収集の範囲を変えて null に戻していたら書かず、次回の実行で新しい範囲を収集する
   */
  const isRecorded = await repo.contentSourceRepository.markCollected(
    source.id,
    status === "completed"
      ? {
        lastCollectedAt: now,
        lastCollectedCommit: {
          expectedSha: source.lastCollectedCommitSha,
          extractionVersion: EXTRACTION_VERSION,
          nextSha: commitSha,
        },
      }
      : { lastCollectedAt: now },
  )
  if (status === "completed" && !isRecorded) {
    logger.warn("last_collected_commit_sha was changed during the collection; the commit SHA is not recorded", {
      commitSha,
      expectedCommitSha: source.lastCollectedCommitSha,
      sourceId: source.id,
    })
  }
  return { ...progress, status }
}
