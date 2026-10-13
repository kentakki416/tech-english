import type { DictionaryEntry } from "@repo/domain"
import { err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { generateLookupCandidates, pickFirstEntry } from "../lib/lookup-dictionary"
import type { DictionaryRepository } from "../repository"

/**
 * 英和辞書を引く。原形に戻した候補をまとめて 1 クエリで引き、候補の順で最初に見つかった項目を返す。どれも無ければ 404
 */
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
