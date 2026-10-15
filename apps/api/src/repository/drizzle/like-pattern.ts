/**
 * 部分一致の ILIKE のパターン（%text%）。text の中の `\`・`%`・`_` はエスケープして、文字のまま探す（SQL 側は ESCAPE '\'）
 */
export const buildContainsLikePattern = (text: string): string => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
