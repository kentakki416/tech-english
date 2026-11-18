import type { DictionaryEntry } from "@repo/domain"
import { err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { generateLookupCandidates, pickFirstEntry } from "../lib/lookup-dictionary"
import type { DictionaryRepository } from "../repository"

export const lookupWord = async (
  input: { word: string },
  repo: { dictionaryRepository: DictionaryRepository },
): Promise<Result<DictionaryEntry>> => {
  const candidates = generateLookupCandidates(input.word)
  const entries = await repo.dictionaryRepository.findByHeadwords(candidates)
  const entry = pickFirstEntry(candidates, entries)
  if (!entry) {
    logger.debug("DictionaryService: Word not found", { candidates, word: input.word })
    return err(notFoundError("Word not found in the dictionary"))
  }
  return ok(entry)
}
