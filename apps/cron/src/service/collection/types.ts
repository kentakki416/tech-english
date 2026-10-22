import type { SourceCollectionResultStatus } from "@repo/domain"

import type { IGitHubContentClient } from "../../client/github"
import type { PassageRepository, SourceDocumentRepository, SourceRepository } from "../../repository"

export type CollectionRepo = {
  /**
   * 収集は本文候補の挿入と、見出しの確認、collected の却下だけを使う（問題生成のメソッドに依存させない）
   */
  passageRepository: Pick<PassageRepository, "findGeneratedOrGeneratingTitles" | "insertIgnoringDuplicates" | "rejectCollected">
  sourceDocumentRepository: SourceDocumentRepository
  sourceRepository: SourceRepository
}

export type CollectionDeps = {
  githubContentClient: IGitHubContentClient
}

export type SourceCollectionStatus = SourceCollectionResultStatus

export type SourceCollectionResult = {
  createdPassageCount: number
  fetchedDocumentCount: number
  status: SourceCollectionStatus
}
