import type { DictionaryEntry } from "@repo/domain"

/**
 * 英和辞書（dictionary_entries。EJDict-hand）のリポジトリ
 */
export interface DictionaryRepository {
  /**
   * 見出し語（小文字）が一致する項目を 1 回のクエリで返す。順序は保証しない（候補の順で選ぶのは lib/lookup-dictionary.ts）。
   * 空配列なら DB を引かずに空配列
   */
  findByHeadwords(headwords: string[]): Promise<DictionaryEntry[]>
}
