/**
 * OS から app に届いた deep link のパスを、expo-router が開く前に書き換える
 *
 * Android では GitHub ログインの戻り（`techenglish://auth/callback?code=...`）が expo-router にも届き、
 * 該当する画面が無いため Unmatched Route になる。結果の受け取りは `WebBrowser.openAuthSessionAsync` が行うので、
 * ルーティングはログイン画面に向け直す。
 */
export const redirectSystemPath = ({ path }: { initial: boolean, path: string }): string =>
  path.includes("auth/callback") ? "/sign-in" : path
