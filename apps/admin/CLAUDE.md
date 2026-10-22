# apps/admin

Next.js 16 (App Router) の admin ダッシュボード（port 3030）。Tailwind CSS v4 + PostCSS。

## Commands

```bash
pnpm dev          # http://localhost:3030 で起動
pnpm build        # 本番ビルド
pnpm start        # 本番サーバー起動
```

## アーキテクチャ

`apps/web` と同じ App Router / API 通信ルールに従う（詳細は `apps/web/CLAUDE.md` を参照）。Admin 固有の方針のみここに記載する。

- 型・スキーマは `@repo/api-schema/admin/` から import（Admin 固有のレスポンスが必要な場合）
- Admin 向け API は `/api/admin/` 配下を呼び出す（API 側の方針は `apps/api/CLAUDE.md` の "Admin API 設計方針" 参照）

## 環境変数

`src/env.ts` に Zod スキーマをインラインで定義し、import 時に `safeParse` → 失敗なら `process.exit(1)`。先頭で `import "server-only"` しているので client component からは import できない。

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `API_URL` | no | `http://localhost:8080` | Express API の origin |
| `GOOGLE_CLIENT_ID` | no | `dummy` | Google OAuth のクライアント ID。api の `GOOGLE_CLIENT_ID` と同じクライアント（web とも同じ） |
| `NEXT_PUBLIC_APP_URL` | yes | - | admin 自身の URL（OAuth の redirect_uri と、サインイン後の戻り先の検査に使う）。末尾の `/` やパスは付いていてもよい（`src/libs/app-origin.ts` で origin にそろえる） |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |

値は `.env.local` に置き、**dotenvx で暗号化して git にコミットする**（api / web / cron / worker と同じ方式）。復号鍵は root の `.env.keys`（git 管理外）で、各 app の `.env.keys` はそこへの symlink。公開鍵は全 app で共有している。

`dev` / `build` / `start` はいずれも `dotenvx run -f .env.local -- ` を通す。

```bash
# 値を追加・変更するときは手書きせず dotenvx を使う。プロジェクトルートで実行する（理由はルートの README.md の「env は dotenvx で管理する」）
npx dotenvx set API_URL "http://localhost:8080" -f apps/admin/.env.local
```

## 認証

一般ユーザー（web）とは別の、admin 専用の認証。`admins` に email を登録した Google アカウントだけがサインインできる（流れは [`docs/onboarding/auth.md` の「admin の認証」](../../docs/onboarding/auth.md#admin-の認証)、設計は [admin-template](../../docs/spec/admin-template/README.md#admin-認証)）。

- **サインイン**: `/signin` の「Google でサインイン」（`app/(auth)/signin/actions.ts` の `startGoogleOAuth`）で Google に送り、`/api/auth/callback/google` が api の `/api/admin/auth/google` で code を検証して cookie に保存する。production 以外は「dev admin でログイン」（`/api/dev/login`。seed の `admin@dev.local` で入る）も出す。production の `/api/dev/login` は公開のパスではないので、サインインしていなければ proxy が 401、サインインしていれば Route Handler が 404 を返す
- **cookie**: `admin_access_token` / `admin_refresh_token` / `admin_oauth_state` / `admin_oauth_redirect`（名前と属性は `src/libs/auth-cookies.ts`、読み書きは `src/libs/auth.ts`）。web の `app_*` とはポートが違っても同じホストなら共有されるので、名前を分けている
- **`src/proxy.ts` は cookie の有無と期限（`exp`）しか見ない UX 用のガード。** 署名は api が確かめる。api を呼ばずに機密を描く画面を作らない（偽の cookie でも画面までは開ける）。`_next/static`・`_next/image`・`favicon.svg`・`images/` 以外のすべて（モックの `/mock` も）が対象で、サインインせずに開けるのは `PUBLIC_PATHS` だけ
- **access token の更新（refresh）は `src/proxy.ts` だけが行う。** 期限まで 30 秒を切っているか無ければ `/api/admin/auth/refresh` を呼び、レスポンスとリクエストの cookie を書き換えて画面に渡す。`apiClient` は refresh しない（Server Component の中では cookie を書けず、セッションが切れる）
- サインインが要るとき、画面は `/signin?redirect=...` に送る。**`/api/` の下の Route Handler は redirect せず 401 の JSON を返す**（ブラウザの `fetch` から呼ばれるため）。**Server Action は止めずに通す**（redirect すると Next.js のクライアントが扱えずエラー画面になる。token が無ければ api の 401 で `apiClient` がサインイン画面に送る）。そのため、**api を呼ばずに状態を変えたり機密を返したりする Server Action を作らない**。サインインせずに開ける画面・Route Handler は `PUBLIC_PATHS` に足す（公開のパスで token を更新するのはサインイン画面だけ）
- **`apiClient` は api の 401 で `/api/auth/signout`（cookie を消してサインイン画面へ送る）に redirect する。** redirect は例外なので、**api の呼び出しを try/catch で囲むときは catch の先頭で `unstable_rethrow(error)` する**（入れないと、セッション切れが「保存に失敗しました」などの表示に化ける）。ブラウザの `fetch` から呼ばれる Route Handler は `apiClient.get(path, { onUnauthorized: "throw" })` で 401 を `ApiClientError` として受け、401 を返す（見本はライセンスの検出の `app/api/sources/license/route.ts`）
- サインイン後の戻り先は `src/libs/safe-redirect.ts` の `resolveSafeRedirectPath` を必ず通す（外のサイトに飛ばさない）
- ログアウトは `src/features/auth/auth.actions.ts` の `logoutAction`（ヘッダーのユーザーメニューの「ログアウト」）
- 認証の処理（proxy の refresh・Google の callback・ログアウト）の失敗は、`console.error` に HTTP の status と `src/libs/error-name.ts` の `getErrorName`（エラーの名前）だけを出す。token・code・cookie・email を含みうる message や応答の中身は出さない
- **admin の登録**: 画面からは足せない。ローカルは seed が `admin@dev.local` を入れる。それ以外の email は `pnpm --filter @repo/db admin:create --email <email>`、dev / min / prd は GitHub Actions の「Admin Create」（`docs/deploy/prd.md`）

Google Cloud の OAuth クライアント（api・web と同じもの）の「承認済みのリダイレクト URI」に、admin の callback を足す。ローカルは Google でのサインインを試すときだけ要る（dev ログインには要らない）。

| 環境 | redirect URI |
| --- | --- |
| ローカル | `http://localhost:3030/api/auth/callback/google` |
| 各環境 | `{NEXT_PUBLIC_APP_URL の origin}/api/auth/callback/google` |

## API 接続の下地

admin は DB を直接触らず、必ず Express API を経由する。tech-english の画面（下の「接続済みの画面」）は API に接続済みで、それ以外は TailAdmin テンプレートの画面がそのまま入っている（API 未接続）。

サイドバー（`components/layout/AppSidebar.tsx`）は見出し付きの 2 つのセクションを並べる。「メニュー」は tech-english の画面（ダッシュボード・問題・URL から追加〈ローカルだけ〉・ソース・タグ・ユーザー）、「デモ」は TailAdmin のデモの画面。

- デモは `/demo/...`（`app/(dashboard)/demo/`・`app/(auth)/demo/`・`components/demo/`）に置き、サイドバーの「デモ」（`components/demo/demo-nav-items.tsx`）に並べる。design-mock の参考として残す
- 新しい画面は土台（`app/(dashboard)/{feature}/`）に作り、サイドバーは `components/layout/nav-items.tsx` の `mainNavSection` に足す
- 土台からデモを import しない（lint の `import/no-restricted-paths` で強制）。デモだけの CSS は `components/demo/demo.css` に置き、`globals.css` に足さない
- デザインモック（`/mock`）はサイドバーに出さず、URL を直接開いて見る

左上のロゴとそのリンク先は `components/layout/AppLogo.tsx`（`src/config/app.ts` の `name` の頭文字のアイコンと `name` の文字。サイドバー・スマホ幅のヘッダー・サインイン画面で使い、サインイン画面の暗い背景では `tone="inverse"`）。favicon は `public/favicon.svg`（同じアイコン）。

アプリ名・説明・言語・タイムゾーンは `src/config/app.ts`（`appConfig`）で変える。タブのタイトルは root の `app/layout.tsx` の `metadata.title.template`（`%s | tech-english admin`）で組み立てるので、各ページの `metadata.title` にはページ名だけを書く（アプリ名を付けない）。

`app/(dashboard)/layout.tsx` は Server Component で、サインイン中の admin（`/api/admin/me`。`features/admin/admin.api.ts`）と通知を取って `components/layout/AdminShell.tsx`（client。サイドバー・ヘッダー・本文の枠）に渡す。ヘッダーの部品（`UserDropdown`・`NotificationDropdown`・`HeaderSearch`）はデータを props で受け取る。layout で `/api/admin/me` を呼ぶので、画面を直接開いたとき・再読み込みのときは api が token を確かめる（proxy は期限しか見ない）。**クライアント側の遷移では layout は描き直されないので、機密を出す画面は自分で api を呼ぶ**。

- 通知は `features/notification/notification.api.ts` で、今は空を返すスタブ（ベルを押すと常に「通知はありません」）。通知を作るときはここを api の呼び出しに差し替える（画面側は変えなくてよい）。通知が取れなくても layout は空で続ける
- ヘッダーの検索は `next/form` の GET でユーザー一覧（`/users?q=...`）に移る。上限は `features/user/user.params.ts` の `USER_LIST_KEYWORD_MAX_LENGTH`（API のクエリのスキーマから取る）
- ヘッダーとマイページのアイコンは `components/ui/avatar/UserAvatar`（画像が無ければ `AvatarText` の頭文字）、表示名は `features/admin/admin-display-name.ts`（名前、無ければ email）。ユーザー管理のアイコンは別の `components/features/user/UserAvatar`

| ファイル | 役割 |
| --- | --- |
| `src/env.ts` | `API_URL` / `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_APP_URL` / `NODE_ENV` を Zod で検証。`server-only`。proxy・`api-client.ts` などから import され、読み込み時に検証が走る |
| `src/libs/api-client.ts` | `env.API_URL` を叩く `get` / `post` / `put` / `delete`。cookie の admin の access token を `Authorization: Bearer` で付ける。401 は `/api/auth/signout` に redirect（`get` に `{ onUnauthorized: "throw" }` を渡すと `ApiClientError`）、それ以外の `!res.ok` は `ApiClientError`（`status` / `body`）を投げる。204 は `undefined` を返す（JSON をパースしない）。`server-only` |
| `src/libs/auth-cookies.ts` | 認証の cookie の名前と属性、`isAccessTokenExpiringSoon`（`exp` まで 30 秒を切ったか。署名は見ない）。proxy からも使うので `next/headers` を import しない |
| `src/libs/auth.ts` | cookie の読み書き（`setAuthCookies` / `clearAuthCookies` / `getAccessToken` / `getRefreshToken`）。書き込みは Server Action と Route Handler からだけ。`server-only` |
| `src/libs/safe-redirect.ts` | `resolveSafeRedirectPath`。サインイン後の戻り先を自分の origin の中のパスに限る（外を指すもの・解釈できないものは `/`） |
| `src/libs/app-origin.ts` | `APP_ORIGIN`（`NEXT_PUBLIC_APP_URL` を origin にそろえた値）と `GOOGLE_REDIRECT_URI` |
| `src/features/{feature}/{feature}.api.ts` | 機能ごとの API 呼び出し層（`server-only`）。レスポンスを `@repo/api-schema` のスキーマで parse して返す |
| `src/libs/ui-classes.ts` | 入力欄・カード・ボタンの共通クラス（テンプレートと同じ見た目）。デザインモックの `mock/_components/ui.ts` と同じ値で、本番の画面はこちらを使う（`mock/` を import しない） |
| `src/libs/date.ts` | 日時の表示の 1 か所。`formatDateTime`：日時（ISO 8601 の文字列か `Date`）を `2026-10-10 03:00` にする、`formatDate`：`2026-10-10`、`formatRelativeTime`：`5 分前`・`2 日前`（30 日より前は `formatDateTime`）。既定のタイムゾーンは `appConfig.timeZone`（Server Component は UTC で動くため明示。`toLocaleString()` を直接使わない）。ユーザーの学習履歴はユーザーのタイムゾーンを渡す |
| `src/libs/format-stats.ts` | ダッシュボード・ユーザー管理の数字の表示（比率 `72%`・件数 `1,284`・時間 `5:12 / 6:00`・値が無いときの `―`） |
| `src/components/ui/table/LinkTableParts.tsx` | 並べ替え・絞り込み・ページ送りを URL のクエリで行う表の部品（`SortableHeaderCell`・`TableSearchForm`〈`next/form`〉・`PaginationLinks`）。ダッシュボードとユーザー一覧で使う（画面内で並べ替える表はテンプレートの `DataTable`） |
| `src/components/ui/tooltip/Tooltip.tsx` | マウスを乗せる・フォーカスすると出る説明の吹き出し（`@floating-ui/react`。TailAdmin のデモと同じ 4 種類）。説明を出すときは `title` 属性ではなく Tooltip を使う。押せないボタン（`disabled`）はマウスのイベントが届かないので `tabIndex={0}` の `span` で包み、`span` に Tooltip を付ける。Server Component で使うときは、Tooltip と子を client component に切り出す（`components/features/user/LoginMethodColumnLabel.tsx`。理由はそのファイル） |
| `src/libs/environment.ts` | `isLocalEnvironment`：ローカル（`next dev`）だけ true。client component からも読める。ローカルだけの機能（URL から追加・サイトのソース）はこれで分ける |
| `src/libs/search-params.ts` | URL のクエリを API のクエリのスキーマの項目で読む（不正なら既定値）・絞り込みの文字を API の上限で切り詰める。`features/*/*.params.ts`（`server-only`）から使う |

接続済みの画面：

| パス | 画面 | 実装 |
| --- | --- | --- |
| `/url-import` | URL から追加（ページを確認して本文候補として保存）。**ローカルだけ**（`src/libs/environment.ts` の `isLocalEnvironment`。production ではメニューに出さず、画面は `notFound()`） | `app/(dashboard)/url-import/page.tsx` + `components/features/url-import/UrlImportForm.tsx` + `app/(dashboard)/url-import/actions.ts`（Server Action。確認と保存）。API は `features/url-import/url-import.api.ts`、ラベルは `url-import.labels.ts`（[url-import](../../docs/spec/url-import/README.md)） |
| `/sources` | ソース一覧 | `app/(dashboard)/sources/page.tsx` + `components/features/source/SourceTable.tsx`。ライセンスの表示名（個人の学習用）は `features/source/source.labels.ts` |
| `/sources/new`・`/sources/[id]` | ソースの登録・編集（取得方法の「サイト」はローカルだけ。サイトは常に無効で、ライセンスに個人の学習用を選べる） | `SourceForm.tsx` + `app/(dashboard)/sources/actions.ts`（Server Action）+ `app/api/sources/license/route.ts`（ライセンス検出の中継）。技術タグの選択は `TagPicker`（選んだ id を hidden の `tag_ids` で送る） |
| `/tags` | タグ | `app/(dashboard)/tags/page.tsx` + `components/features/tag/TagTable.tsx`（追加・編集は `TagFormModal`、削除の確認は `TagDeleteModal`）+ `app/(dashboard)/tags/actions.ts`（Server Action）。色付きのタグは `TagChip`（色 → クラスの対応表はここだけに置く） |
| `/passages` | 問題一覧（`?status=` で状態を切り替え） | `app/(dashboard)/passages/page.tsx` + `components/features/passage/PassageTable.tsx` |
| `/passages/[id]` | 問題の確認・修正 | `PassageReview.tsx`（タブは `QuestionsTab` / `TranslationsTab` / `GlossaryTab` / `BodyTab` / `BasicsTab`、プレビューは `PassagePreview`、読み上げの音声は `PassageAudioCard`）+ `app/(dashboard)/passages/[id]/actions.ts`（Server Action）。フォームの状態と変換は `features/passage/passage.form.ts`、ラベルは `passage.labels.ts` |
| `/` | ダッシュボード（`?period=&sort=&order=&page=&q=`） | `app/(dashboard)/page.tsx` + `components/features/stats/`（`PeriodTabs`・`OverviewCards`・`OverviewChart`〈ApexCharts。Client〉・`AssistCard`・`PassageStatsTable`）。API は `features/stats/stats.api.ts`、URL のクエリは `stats.params.ts`（[admin-dashboard](../../docs/spec/admin-dashboard/README.md)） |
| `/analytics/passages/[id]` | 問題の分析（`?period=`） | `app/(dashboard)/analytics/passages/[id]/page.tsx` + `QuestionStatsCard`。サイドバーでは「ダッシュボード」を選択中にする |
| `/users` | ユーザー一覧（`?sort=&order=&page=&q=`） | `app/(dashboard)/users/page.tsx` + `components/features/user/UserTable.tsx`。API は `features/user/user.api.ts`、URL のクエリは `user.params.ts`（[admin-users](../../docs/spec/admin-users/README.md)） |
| `/users/[id]` | ユーザーの詳細 | `UserProfileCard`・`UserLearningCards`・`UserCalendar`・`UserAttemptList`（「さらに読み込む」は `app/(dashboard)/users/[id]/actions.ts` の Server Action） |
| `/profile` | マイページ（サインイン中の admin） | `app/(dashboard)/profile/page.tsx` + `components/features/profile/AdminProfileCards.tsx`。API は `features/admin/admin.api.ts` |

問題の画面のメモ：

- プレビューの書体（Literata）は `app/(dashboard)/passages/layout.tsx` で読み込む
- 確認・修正のフォームは詳細から作る 1 つの state（`PassageForm`）。保存・公開・却下などは `useActionState` の 1 つの action に操作（command）として渡し、`startTransition` から呼ぶ。保存・状態の変更で詳細が取り直されたら（`status` と `updated_at` が変わったら）フォームを作り直す
- 読み上げの音声のカード（`PassageAudioCard`）は詳細の `audio` が null（下書きなどで音声の行も無い）なら出さない。状態（準備中・生成中・作成済み・失敗）と作成日時を出し（非公開に戻した問題の作成済みの音声は、本文を直したかもしれないので API が準備中を返す）、失敗のときは「再試行」（`retryPassageAudioAction`）、作成済みのときは「作り直す」（確認のダイアログの後に `regeneratePassageAudioAction`。依頼中〈`regenerate_requested_at` がある〉は「作り直しを待っています」を出してボタンは出さない）。作成済みで `last_error` があるのは voice の変更・作り直しに失敗して前の音声を出し続けているときで、エラーも出す。どちらの操作も 409 は「音声の状態が変わりました」。フォームとは別の `useTransition` で呼ぶので、未保存の修正は消えない
- 「公開する」と「要確認を解除」は未保存の修正があれば先に保存する（要確認の解除も `updated_at` を変えるので、そのままだとフォームが作り直されて修正が消える）。保存・公開の 400 の `details` は、リクエストを作ったときのフォームで設問・語句の `clientKey` に直してから該当の項目に印を付ける（エラーの後に設問を消しても印が別の設問に移らないように）

画面を API に繋ぐときは:

1. Server Component か Route Handler から `features/*.api.ts` 経由で `apiClient` を呼ぶ（`server-only` なので client component からは import できない）。一覧のように build 時に静的生成されると困るページは `await connection()` で動的にする
2. レスポンスは `@repo/api-schema` のスキーマで parse する。**独自に型を書かない**
3. client component にデータが必要な場合は Server Component で取得して props で渡す。Zod のスキーマ（値）を client component で import すると bundle に入るので、選択肢などの値も Server Component から props で渡す
4. 登録・更新は Server Action（`actions.ts`。先頭に `"use server"` と `import "server-only"`）。404 / 409 は `ApiClientError` の `status` で見分ける。フォームは `useActionState` を使い、`<form action>` ではなく `onSubmit` から `startTransition(() => formAction(formData))` で呼ぶ（`<form action>` だと React が送信後にフォームをリセットし、入力エラーのときに値が消える）
5. 画面を開いた後に続きを読む（ユーザーの詳細の「さらに読み込む」など）ときも Server Action にする（admin の API はトークンが要り、ブラウザから直接呼べないため）。引数は API と同じスキーマで検証し、一時的な失敗は throw せずに失敗の結果で返す（throw すると error boundary に送られ、読み込んだ分ごと画面が消える）
6. api の呼び出しを try/catch で囲むときは、catch の先頭で `unstable_rethrow(error)` する（api の 401 で `apiClient` が投げる redirect を通すため。[認証](#認証)）

`@repo/*` のうち admin が import できるのは `@repo/api-schema` だけで、これは lint で強制している（`@repo/eslint-config/frontend-boundary`）。

## 動作確認（必須）

UI コードを実装・修正したら **必ず Playwright MCP で実画面の動作確認** を行う（詳細は `apps/web/CLAUDE.md` の「動作確認（必須）」セクションを参照）。port は 3030。`pnpm build` だけで「動作確認済み」と報告するのは禁止。

## PR 作成時の before/after スクショ（必須）

見た目に影響する Admin の PR も `docs/screenshots/{feature}/{before,after}.png` を PR 本文に含める（詳細は `apps/web/CLAUDE.md` の「PR 作成時の before/after スクショ（必須）」セクションを参照）。
