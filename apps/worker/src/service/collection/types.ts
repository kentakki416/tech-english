import type { SourceCollectionResultStatus } from "@repo/domain"

import type { IGitHubContentClient } from "../../client/github"
import type { PassageRepository, SourceDocumentRepository, SourceRepository } from "../../repository"

export type CollectionRepo = {
  passageRepository: PassageRepository
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
