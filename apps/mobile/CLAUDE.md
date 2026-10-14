# apps/mobile

Expo + React Native アプリケーション。expo-router によるファイルベースルーティング。

## Commands

```bash
pnpm start        # Expo dev server
pnpm android      # Android で起動
pnpm ios          # iOS で起動
```

## アーキテクチャ

- ファイルベースルーティング: `app/` ディレクトリ
- ナビゲーション: React Navigation（bottom tabs）
  - タブの上に積んだ画面（解答・結果など）からタブへ戻るときは `router.dismissTo("/passages")` のように `dismissTo` を使う（`router.replace` だとルートのスタックにタブがもう 1 つ積まれる）
- テーマ: `@react-navigation/native`
- 型・スキーマは `@repo/api-schema` から import（**ローカル独自定義は禁止**：API 側の変更に追従できず型不整合バグが発生するため）

## 環境変数

検証は `src/env.ts` に Zod スキーマをインラインで定義（他 app と同じ方針）。参照は必ず `import { env } from "@/env"` を経由する（`process.env.EXPO_PUBLIC_*` の直参照は ESLint の `no-restricted-syntax` で禁止）。

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | yes | - | Express API の origin。実機は localhost に到達できないため開発時は LAN IP を指定する（例: `http://192.168.3.13:8080`） |
| `EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID` | yes | - | GitHub OAuth App の Client ID（web と同じ App。Client Secret は api だけが持つ） |
| `EXPO_PUBLIC_WEB_URL` | yes | - | web の origin。GitHub ログインの `redirect_uri`（`{web}/api/auth/callback/github/mobile`）に使うため、GitHub OAuth App の callback URL と host を揃える（local の iOS シミュレーターは `http://localhost:3000`、Android エミュレーターは `adb reverse tcp:3000 tcp:3000` を通して同じ値） |

値は `.env.local` に置く（Expo が自動で読み込む）。

**`EXPO_PUBLIC_*` はビルド時に JS バンドルへ展開され、クライアントから読み取れる。** 秘密情報は置かず、API 側の env に置いて Express API 経由で扱う。`.env.local` を dotenvx で暗号化しないのもこの理由（公開前提の値しか入らない）。

他 app との差分は 2 点:

- **`safeParse(process.env)` ではなくキーを 1 つずつ静的に列挙する**: babel-preset-expo は `process.env.EXPO_PUBLIC_*` という形の MemberExpression だけをビルド時に置換するため、`process.env` をオブジェクトとして渡しても `EXPO_PUBLIC_*` は入っていない
- **`process.exit(1)` ではなく throw する**: RN ランタイムに `process.exit` は無い。module scope の throw は dev では LogBox の redbox、release では起動時クラッシュになる

なお `process.env.EXPO_OS` は Expo が platform 名へ置換するビルド時定数（開発者が設定する env ではない）なので `src/env.ts` の管理対象外。

## 開発用のログインとブラウザでの確認

- **Dev Login**: `__DEV__` のときだけ、ログイン画面の下に「Dev Login: alice / bob」を出す。api の `POST /api/auth/dev-login`（[dev-login](../../docs/spec/dev-login/README.md)。api 側は production で無効）でトークンを受け取り、GitHub ログインと同じく保存してログイン中にする（`features/auth/auth.session.ts` の `signInAsDevUser`）
- **web 表示のトークン**: secure-store は web で動かないため、`__DEV__` かつ `Platform.OS === "web"` のときだけ `localStorage` に保存する（`features/auth/auth.storage.ts`）。本番の web ビルドと iOS / Android は secure-store のまま
- ログイン後の画面をブラウザで確かめる手順（シミュレーターが無いとき）:
  1. `app.json` の `web.output` を一時的に `single` にする（`static` は 500 になる。終わったら必ず `static` に戻す）
  2. api の CORS を Expo の origin に合わせて起動する: `cd apps/api && FRONTEND_URL=http://localhost:8085 pnpm dev`
  3. `EXPO_PUBLIC_API_URL` を `http://localhost:8080` にして起動する。dev のバンドルは `.env*` ファイルの値がシェルの環境変数より優先されるため、一時的な `apps/mobile/.env.development.local`（`EXPO_PUBLIC_API_URL=http://localhost:8080`）で上書きし、終わったら消す（git 管理外にしていないのでコミットしない）
  4. `npx expo start --web --port 8085` → ログイン画面の「Dev Login: alice」
- web 表示で確かめられないこと: 振動（`expo-haptics`）、`Alert.alert`（react-native-web では何も出ない）、Android の戻るボタン、描画性能、引っ張って更新（`RefreshControl`）、日付の選択（`@react-native-community/datetimepicker` は web の実装が無い。設定画面の目標日は web 表示だけ `YYYY-MM-DD` の入力欄で代用する。`TargetDateField.tsx`）、Modal の `pageSheet`（web では全面に出る）、ローカル通知（`expo-notifications` の権限・予約・タップ。web 表示では OS の通知に触れず、リマインダーの設定の保存だけを行う。権限は null として扱うので「通知が許可されていません」の案内も出ない。`features/study-reminder/study-reminder.notification.ts`）。本文の長押し（`Pressable` の `onLongPress`）はマウスを押し続けると和訳が重なるが、離すと単語のカードも出る（react-native-web の `Text` の `onPress` は click で、長押しで取り消されないため。iOS / Android の Responder は長押しが成立すると `onPress` を呼ばない）。読み上げ（`expo-audio`。web 表示では HTML の audio で動く）の消音モードでの再生・ほかのアプリの音声との切り替え（`setAudioModeAsync` は web では何もしない）、アプリを閉じたときの一時停止（`AppState`。web 表示ではタブを隠したときに同じく止まる）、本文を指で動かしたときの自動スクロールの停止（react-native-web の `ScrollView` は `onScrollBeginDrag` を出さないので、web 表示ではホイールで動かしても追い続ける）。読み込めない mp3 では、web 表示だけ expo-audio の `play()` の Promise の失敗がコンソールのエラーに出る（画面は 10 秒後に「読み上げを読み込めませんでした」になる）
