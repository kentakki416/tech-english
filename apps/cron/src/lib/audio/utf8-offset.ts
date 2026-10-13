/**
 * コードポイントの UTF-8 のバイト数。孤立したサロゲート（0xD800〜0xDFFF）は UTF-8 で U+FFFD（3 バイト）になるので 3（Buffer.byteLength と一致する）
 */
const countUtf8Bytes = (codePoint: number): number => {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

/**
 * UTF-8 のバイト位置 → UTF-16 の index の表を作る（Polly の Speech Marks の start / end はバイト位置で返るため）。
 * 長さはバイト数 + 1 で、末尾のバイト位置（= バイト数）は text.length。コードポイントの途中のバイトはそのコードポイントの先頭の index にする
 */
export const createUtf8ToUtf16IndexMap = (text: string): Uint32Array => {
  const map = new Uint32Array(Buffer.byteLength(text) + 1)
  let byteOffset = 0
  let utf16Index = 0
  for (const char of text) {
    const byteCount = countUtf8Bytes(char.codePointAt(0) ?? 0)
    map.fill(utf16Index, byteOffset, byteOffset + byteCount)
    byteOffset += byteCount
    utf16Index += char.length
  }
  map[byteOffset] = utf16Index
  return map
}
