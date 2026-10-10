/**
 * Basic 認証の検査（src/proxy.ts から使う純関数）。
 *
 * proxy のランタイムに依存しないよう node:crypto は使わず、Web 標準の API（atob / TextDecoder）だけで書く。
 */

/**
 * 2 つの文字列が等しいかを、内容によって処理時間が変わらないように比べる。
 *
 * 長さが違っても早期 return せず、期待値の長さぶん必ずループする（文字ごとの XOR を OR で溜める）。
 * ループ回数は期待値の長さだけで決まり、入力の内容や長さでは変わらない。
 */
const isEqualInConstantTime = (actual: string, expected: string): boolean => {
  let diff = actual.length ^ expected.length
  for (let i = 0; i < expected.length; i++) {
    /**
     * actual が短いときの範囲外は NaN になるので 0 として扱う（長さの差は上の初期値で不一致になる）
     */
    const actualCode = i < actual.length ? actual.charCodeAt(i) : 0
    diff |= actualCode ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * `Authorization: Basic <base64>` から user と password を取り出す。形式が違えば undefined。
 *
 * base64 を外した中身は UTF-8 のバイト列として読む（WWW-Authenticate で charset="UTF-8" を指定している）。
 * password に `:` が含まれていてもよいよう、最初の `:` で分ける。
 */
const decodeBasicCredentials = (header: string | null): { password: string; user: string } | undefined => {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i)
  if (!match) return undefined

  let decoded: string
  try {
    const binary = atob(match[1])
    decoded = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
  } catch {
    return undefined
  }

  const separatorIndex = decoded.indexOf(":")
  if (separatorIndex < 0) return undefined
  return {
    password: decoded.slice(separatorIndex + 1),
    user: decoded.slice(0, separatorIndex),
  }
}

/**
 * Authorization ヘッダの資格情報が期待値と一致するか。
 * user と password の両方を必ず比べる（片方の不一致で短絡させない）。
 */
export const isBasicAuthValid = (header: string | null, expectedUser: string, expectedPassword: string): boolean => {
  const credentials = decodeBasicCredentials(header)
  if (!credentials) return false

  const isUserValid = isEqualInConstantTime(credentials.user, expectedUser)
  const isPasswordValid = isEqualInConstantTime(credentials.password, expectedPassword)
  return isUserValid && isPasswordValid
}
