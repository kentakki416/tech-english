# step4-mobile-github-login

mobile に GitHub ログイン（端末のブラウザ + PKCE）、トークンの保管、401 時の refresh、ログアウトを作り、未ログインではログイン画面しか開けないようにする。本番のデザイントークン・フォント・本文の部品もここで本番の場所に移す。

## 前提

- [step2-api-auth-github](./step2-api-auth-github.md)、[step3-web-github-login](./step3-web-github-login.md)（`/api/auth/callback/github/mobile` を使う）
- 仕様: [mobile のフロー](../README.md#mobile-のフロー)、[トークンの保管](../README.md#トークンの保管)、[mobile の画面](../README.md#mobile-の画面)。見た目の正本は `apps/mobile/src/app/mock/sign-in.tsx`（モックは消さない）
- custom scheme を使うため **Expo Go では確認できない**。development build（`pnpm --filter mobile exec expo run:ios` 等）で確認する

## 対応内容

### 1. 依存・scheme・環境変数

```bash
pnpm --filter mobile exec expo install expo-crypto expo-localization expo-secure-store
```

- `app.json` の `"scheme"` を `"mobile"` から `"techenglish"` に変える（リマインダーの通知の `techenglish://passages/random` も同じ scheme）
- `src/env.ts` に `EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID: z.string().min(1)` と `EXPO_PUBLIC_WEB_URL: z.string().url()` を足し、`safeParse` に 1 つずつ列挙する。`apps/mobile/CLAUDE.md` の環境変数の表にも足す

### 2. デザイントークン・フォント・共通部品の移植

| 移植元 | 移植先 | 変更点 |
| --- | --- | --- |
| `src/const/mock-theme.ts` | `src/const/design-theme.ts` | `MOCK_COLORS` / `MOCK_HEAT_COLORS` / `MOCK_FONTS` を `THEME_COLORS` / `HEAT_COLORS` / `THEME_FONTS` に改名（learning-record step5・reading-practice step8 と同じ名前） |
| `src/components/mock/parts.tsx` の `Wordmark` | `src/components/ui/Wordmark.tsx` | トークンを `THEME_*` に |
| 同 `mockStyles` | `src/components/ui/app-styles.ts`（`appStyles`） | 同上 |
| `src/components/mock/PassageReader.tsx`（`PassageReader` / `WordCard` / `WordCardContent`） | `src/components/features/passage/PassageReader.tsx` | 型を新設の `src/components/features/passage/types.ts` から import する（中身は web の [step3](./step3-web-github-login.md#6-本文の部品を共通部品に移植する) の `ReaderBlock` / `ReaderGlossaryEntry` と同じ）。描画・長押し・単語のタップは変えない |
| `src/components/mock/passage-text.ts` | `src/components/features/passage/passage-text.ts` | 同上 |

- `parts.tsx` の残りは、[learning-record step5](../../learning-record/tasks/step5-mobile-mypage.md)（`PrimaryButton` / `SecondaryButton` / `Segment` / `Chip` / `ScoreSquares` → `src/components/ui/`）と [reading-practice step8](../../reading-practice/tasks/step8-mobile-passage-list.md)（`SourceMeta` / `DifficultyMeter` → `src/components/features/passage/`）が移す。モックは `mock-theme.ts` を参照したままでよい
- フォントはルートレイアウトで読み込む（下の 3）。`mock/_layout.tsx` の `useFonts` は残してよい（読み込み済みなら即座に返る）

### 3. ルートレイアウト（`src/app/_layout.tsx`）

```tsx
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const status = useAuthStore((state) => state.status)
  const [isFontLoaded] = useFonts({ IBMPlexMono_400Regular, IBMPlexMono_500Medium, Literata_400Regular, Literata_600SemiBold })
  const isReady = isFontLoaded && status !== "loading"

  useEffect(() => {
    void restoreSession()
  }, [])

  useEffect(() => {
    if (isReady) void SplashScreen.hideAsync()
  }, [isReady])

  if (!isReady) return null

  return (
    /** 既存の GestureHandlerRootView / ThemeProvider / screenOptions はそのまま */
    <Stack screenOptions={...}>
      <Stack.Protected guard={status === "signedIn"}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/** 既存の memo/new・memo/[id]・modal もここに入れる */}
      </Stack.Protected>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="mock" options={{ headerShown: false }} />
    </Stack>
  )
}
```

フォントは `@expo-google-fonts/{literata,ibm-plex-mono}/{weight}` から deep import する（`mock/_layout.tsx` と同じ）。`status` が変わると expo-router が許可された画面へ自動で移るので、ログイン・ログアウト後に `router.replace` は書かない。

### 4. トークンの保管と認証状態

```typescript
/** src/features/auth/auth.storage.ts（expo-secure-store。Keychain / Keystore） */
const ACCESS_TOKEN_KEY = "techenglish.access_token"
const REFRESH_TOKEN_KEY = "techenglish.refresh_token"

export type StoredTokens = { accessToken: string; refreshToken: string }

export const getStoredTokens = async (): Promise<StoredTokens | null> => { /** 2 つとも揃っていれば返す */ }
export const saveTokens = async (tokens: StoredTokens): Promise<void> => { /** setItemAsync × 2 */ }
export const clearStoredTokens = async (): Promise<void> => { /** deleteItemAsync × 2 */ }
```

```typescript
/** src/features/auth/auth.store.ts */
export type AuthStatus = "loading" | "signedIn" | "signedOut"

export const useAuthStore = create<{ status: AuthStatus; setStatus: (status: AuthStatus) => void }>((set) => ({
  status: "loading",
  setStatus: (status) => set({ status }),
}))
```

### 5. API クライアント（`src/libs/api-client.ts`）

`axios.create({ baseURL: env.EXPO_PUBLIC_API_URL })` に 2 つの interceptor を付ける。以降の機能の `*.api.ts` はこれを使う（既存の `memo.api.ts` は置き換え対象なので触らない）。

- request: `getStoredTokens()` があれば `Authorization: Bearer {accessToken}`
- response: 401 かつ未再試行（`config.isRetry` が無い）なら `refreshOnce()` → 成功したら `isRetry = true` を付けて同じ config で 1 回だけ再送。失敗したら元のエラーを throw

```typescript
let refreshPromise: Promise<boolean> | null = null

/** 同時に複数の 401 が来ても refresh は 1 回だけ（refresh token はローテーションで 1 回しか使えない） */
const refreshOnce = (): Promise<boolean> => {
  refreshPromise ??= tryRefresh().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

const tryRefresh = async (): Promise<boolean> => {
  const tokens = await getStoredTokens()
  if (!tokens) return false
  try {
    /** interceptor を通さないよう素の axios で呼ぶ */
    const res = await axios.post(`${env.EXPO_PUBLIC_API_URL}/api/auth/refresh`, { refresh_token: tokens.refreshToken })
    const body = authRefreshResponseSchema.parse(res.data)
    await saveTokens({ accessToken: body.access_token, refreshToken: body.refresh_token })
    return true
  } catch (error) {
    /** 401 のときだけログアウトする（通信エラーではログイン状態を消さない） */
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await clearStoredTokens()
      useAuthStore.getState().setStatus("signedOut")
    }
    return false
  }
}
```

### 6. GitHub ログイン（PKCE）

`src/features/auth/github-oauth.ts`:

```typescript
const APP_CALLBACK_URL = "techenglish://auth/callback"

export const GITHUB_MOBILE_REDIRECT_URI = `${env.EXPO_PUBLIC_WEB_URL}/api/auth/callback/github/mobile`

export type GitHubAuthSessionResult =
  | { code: string; codeVerifier: string; kind: "success" }
  | { kind: "cancelled" }
  | { kind: "failed" }

export const openGitHubAuthSession = async (): Promise<GitHubAuthSessionResult> => {
  const state = Crypto.randomUUID()
  const { codeChallenge, codeVerifier } = await createPkcePair()
  const authorizeUrl = `https://github.com/login/oauth/authorize?${toQueryString({
    client_id: env.EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: GITHUB_MOBILE_REDIRECT_URI,
    scope: "read:user user:email",
    state,
  })}`
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, APP_CALLBACK_URL)
  if (result.type !== "success") return { kind: "cancelled" }

  const { queryParams } = Linking.parse(result.url)
  if (queryParams?.error || queryParams?.state !== state || typeof queryParams?.code !== "string") return { kind: "failed" }
  return { code: queryParams.code, codeVerifier, kind: "success" }
}
```

- `createPkcePair`: `Crypto.getRandomBytes(32)` を `btoa` で base64 → base64url（`+`→`-`、`/`→`_`、`=` を削る）にして verifier（43 文字）。`Crypto.digestStringAsync(SHA256, verifier, { encoding: BASE64 })` を base64url にして challenge
- `toQueryString` は `encodeURIComponent` で組み立てる小さな関数（RN の `URLSearchParams` の実装差に依存しない）

`src/features/auth/auth.api.ts` に `authApi.signInWithGitHub(body: AuthGitHubRequest)`（`POST /api/auth/github` → `authGitHubResponseSchema.parse`）と `authApi.logout(refreshToken)`（`POST /api/auth/logout`）を置く。

`src/features/auth/auth.session.ts`:

| 関数 | 処理 |
| --- | --- |
| `restoreSession()` | `getStoredTokens()` があれば `signedIn`、無ければ `signedOut`（access token の期限切れは api client の refresh に任せる） |
| `signInWithGitHub(): Promise<"cancelled" \| "failed" \| "signedIn">` | `openGitHubAuthSession()` → 成功なら `authApi.signInWithGitHub({ code, code_verifier, redirect_uri: GITHUB_MOBILE_REDIRECT_URI, timezone: Localization.getCalendars()[0]?.timeZone ?? undefined })` → `saveTokens` → `setStatus("signedIn")`。API の失敗は `"failed"` |
| `signOut()` | refresh token があれば `authApi.logout` を呼び（失敗しても続ける。web の `logoutAction` と同じ）、`clearStoredTokens()` → `setStatus("signedOut")`。通知の予約の取り消しは [study-reminder step3](../../study-reminder/tasks/step3-mobile-reminder.md) がここに足す |

### 7. Android の deep link（`src/app/+native-intent.tsx`）

Android では `techenglish://auth/callback` が expo-router にも届き Unmatched Route になる。`redirectSystemPath({ path })` で `auth/callback` を含むパスは `"/sign-in"` に向け直し、それ以外はそのまま返す（結果の受け取りは `openAuthSessionAsync` が行う）。

### 8. ログイン画面（`src/app/sign-in.tsx`）

`src/app/mock/sign-in.tsx` を移植する。

- import を `THEME_COLORS` / `appStyles` / `Wordmark` / `PassageReader` の新しい場所に替える
- デモのデータは `src/components/features/auth/sign-in-demo-data.ts` に **値ごとコピー**（`MOCK_BLOCKS[5]`、`blockIndex === 5` の語句を `blockIndex: 0` にした用語集、`MOCK_DICTIONARY`）
- 「GitHub でログイン」の `onPress` を `signInWithGitHub()` に替える。実行中は `disabled` と `opacity: 0.6`、結果が `"failed"` なら注記の上に「ログインに失敗しました。もう一度お試しください。」を `THEME_COLORS.wrong` で出す。`"cancelled"` は何も出さない

### 9. ログアウト（仮置き）

設定画面は [learning-record step5](../../learning-record/tasks/step5-mobile-mypage.md) が作る。この step では確認用に、既存の `src/app/(tabs)/setting.tsx` の末尾に「ログイン中: {name}」（`src/features/user/user.api.ts` の `userApi.get()` = `GET /api/user` を `getUserResponseSchema.parse`）と「ログアウト」（`signOut()`）を置く。learning-record step5 で設定画面ごと置き換わる。

## 動作確認

```bash
pnpm --filter mobile exec expo run:ios   # Android は expo run:android
pnpm --filter mobile lint
pnpm --filter mobile exec tsc --noEmit
```

local では GitHub に登録した callback（`http://localhost:3000/...`）と host を揃えるため、iOS シミュレーターは `EXPO_PUBLIC_WEB_URL=http://localhost:3000` / `EXPO_PUBLIC_API_URL=http://localhost:8080`、Android エミュレーターは `adb reverse tcp:3000 tcp:3000` と `adb reverse tcp:8080 tcp:8080` を通して同じ値にする。

- [ ] 未ログインで起動するとログイン画面だけが開け、タブに入れない
- [ ] デモで単語のタップでカード、段落の長押しで押している間だけ和訳、「訳」で切り替わる（モックと同じ見た目）
- [ ] 「GitHub でログイン」→ 許可 → app に戻り、タブ（現状はメモ）が開く
- [ ] DB に `provider = "github"` の行ができ、`users.timezone` が端末のタイムゾーン
- [ ] 認可画面を閉じる → ログイン画面のまま、エラーは出ない
- [ ] app を終了して起動し直してもログインしたまま
- [ ] api を `JWT_ACCESS_EXPIRATION=1m` で起動し、1 分後に設定タブを開く → 名前が出る（refresh されて再試行。Redis の jti が入れ替わる）
- [ ] Redis の refresh token のキーを消してから同じ操作 → ログイン画面に戻る
- [ ] ログアウト → ログイン画面に戻り、Redis の jti が消え、もう一度起動してもログイン画面
- [ ] Android で戻ったときに Unmatched Route が出ない
