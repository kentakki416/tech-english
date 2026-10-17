# 認証まわりのルール

認証は **Google OAuth でサインイン → 自前 JWT を発行**する方式。web が「ブラウザ ↔ api の翻訳役」として前段に立ち、api は「code をもらって JWT を返すだけ」のステートレスな変換器に保つ。

このページは**キャッチアップに必要なルール**をまとめる。①〜⑬ の完全なシーケンス図付き解説は [`docs/auth.md`](../auth.md) を参照。

## 目次

- [トークン設計](#トークン設計)
- [cookie と認証ガード](#cookie-と認証ガード)
- [なぜ web を間に挟むのか](#なぜ-web-を間に挟むのか)
- [URL の注意（Next.js Route Handler と Express の混同）](#url-の注意nextjs-route-handler-と-express-の混同)
- [セキュリティ設計のまとめ](#セキュリティ設計のまとめ)
- [admin の認証](#admin-の認証)
- [新しいプロバイダを追加するには](#新しいプロバイダを追加するには)
- [関連ファイル](#関連ファイル)
- [関連ドキュメント](#関連ドキュメント)

## トークン設計

| トークン | 有効期限 | 保存先 | 用途 |
|---|---|---|---|
| **access token** | 15 分 | httpOnly cookie（`app_access_token`） | 各リクエストの認証 |
| **refresh token** | 7 日 | httpOnly cookie（`app_refresh_token`）+ jti を Redis 管理 | access の再発行 |

- Google の access_token は **使い捨て**。ユーザー情報取得後は破棄し、以降はすべて**アプリ独自の JWT** で認証する。
- refresh token の **jti を Redis で管理**することで、サーバー側から個別失効・ローテーション運用ができる。
- access が短命（15 分）なので漏洩時の影響時間を抑えつつ、利便性は refresh（7 日）で確保する。

## cookie と認証ガード

- JWT は **httpOnly cookie** に保存する（JavaScript から触れないので XSS で盗まれない）。cookie 操作は web 側（`apps/web/src/libs/auth.ts`）で完結させる。
- cookie は **`sameSite=lax`**（OAuth コールバックの cross-site 連鎖ナビゲーションでも送信されるようにするため）。
- 認証ガードは web の **middleware**（`apps/web/src/middleware.ts`）が cookie の有無で行う。未認証は `/sign-in` へリダイレクト。
- CSRF 対策として **state**（ランダム文字列）を cookie に保存し、コールバック時に照合する。
- api 側は `PUBLIC_PATHS` で認証要否を制御する。Admin API（`/api/admin/`）は一般ユーザーとは別の admin 専用の認証で守る（[admin の認証](#admin-の認証)）。

## なぜ web を間に挟むのか

Google の `redirect_uri` を直接 Express api に向けず、web が前段で受けて api に転送する設計にしている。理由:

1. **JWT を httpOnly cookie に保存するのは Next.js 側のみ** — Express から `Set-Cookie` を返してもドメインが違うと保存させづらい（CORS / SameSite 制約）。
2. **state cookie の照合は web で完結** — web で発行した cookie を web で読む方がシンプル。
3. **api はステートレスに保てる** — api は「code もらって JWT を返すだけ」の純粋な変換器でいられる。

## URL の注意（Next.js Route Handler と Express の混同）

`/api/` で始まる URL でも Express api とは限らない。**Next.js の Route Handler も `/api/...` を使う**ので混同しないこと。

| URL | 実体 | サーバ | ファイル |
|---|---|---|---|
| `localhost:3000/api/auth/callback/google` | **Next.js Route Handler** | web (:3000) | `apps/web/src/app/api/auth/callback/google/route.ts` |
| `localhost:8080/api/auth/google` | **Express の POST エンドポイント** | api (:8080) | `apps/api/src/controller/auth/google.ts` |

## セキュリティ設計のまとめ

| 仕組み | 目的 |
|---|---|
| `code` → `access_token` の 2 段階交換 | パスワード相当の access_token をブラウザに渡さない |
| **state** cookie | CSRF 対策 |
| **httpOnly** cookie | XSS で JWT を盗まれない |
| **access(15分) + refresh(7日)** の 2 種類 | 漏洩時の影響を短時間化しつつ利便性を確保 |
| **Client Secret は api だけ**が持つ | ブラウザに漏れない |
| refresh の **jti を Redis 管理** | サーバー側で個別失効・ローテーション運用が可能 |
| cookie は **sameSite=lax** | OAuth コールバックの cross-site ナビでも cookie が送信される |

## admin の認証

管理画面（`apps/admin`）は、一般ユーザーとは別の admin 専用の認証を持つ。流れ（OAuth → api が code を検証 → 自前の JWT → httpOnly cookie）は一般ユーザーと同じで、次を分ける。

| | 一般ユーザー | admin |
|---|---|---|
| サインインの方法 | GitHub（PKCE） | Google（`admins` に email を登録した、Google で確認済みのアカウントだけ） |
| テーブル | `users` + `auth_accounts` | `admins`（事前登録制。`admin:create` で登録する） |
| JWT の payload / 鍵 | `{ userId }` / `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `{ adminId }` / `JWT_ADMIN_ACCESS_SECRET` / `JWT_ADMIN_REFRESH_SECRET` |
| refresh token の Redis のキー | `refresh_token:{jti}` / `refresh_token_rotated:{jti}` | `admin_refresh_token:{jti}` / `admin_refresh_token_rotated:{jti}` |
| api の認証ミドルウェア | `authMiddleware`（全体。`/api/admin` は見ない） | `adminAuthMiddleware`（`mountAdminApi` で `/api/admin` の mount の中だけ） |
| cookie | `app_*` | `admin_*`（ポートが違っても同じホストなら cookie は共有されるので名前を分ける） |

- 一般ユーザーのトークンでは admin の API に入れない（逆も同じ）。鍵が違うので検証で必ず失敗する。JWT の鍵 4 つのうち同じ値があれば api は起動しない
- `adminAuthMiddleware` を全体ではなく mount の中に置くのは、Express 5 の mount と Router が大文字小文字を区別せず、`/API/Admin/...` が文字列の比較をすり抜けるため
- access token の更新は admin の proxy（`apps/admin/src/proxy.ts`）で行う。期限が近い・切れていれば `POST /api/admin/auth/refresh` を呼んで cookie を書き直す。refresh は一般ユーザーと同じく 30 秒の猶予があり、同じ refresh token が同時に 2 回来ても同じペアを返す
- `admins` から消された admin は、次の更新（最長 15 分後）で 401 になりサインイン画面に戻る
- ローカルは seed の `admin@dev.local` に dev ログイン（`POST /api/admin/auth/dev-login`）で入れる

設計の詳細は [`../spec/admin-template/README.md`](../spec/admin-template/README.md) の「admin 認証」。api 側の規約は [`../../apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md) の「Admin API 設計方針」。

## 新しいプロバイダを追加するには

GitHub / Apple / X 等を追加する場合、`apps/api/src/client/*-oauth.ts` を新設して `AuthAccount.provider` の文字列を増やすだけで対応できる。`auth-service.ts` の既存ユーザー検索 / JWT 発行 / refresh 保存ロジックは**プロバイダ非依存**に作られている。

## 関連ファイル

**web (Next.js)**
- `apps/web/src/app/sign-in/actions.ts` — `startGoogleOAuth`（Server Action）
- `apps/web/src/app/api/auth/callback/google/route.ts` — Google callback Route Handler
- `apps/web/src/libs/auth.ts` — cookie 操作（`setAuthCookies` ほか）
- `apps/web/src/middleware.ts` — 認証ガード

**api (Express)**
- `apps/api/src/controller/auth/google.ts` — `POST /api/auth/google`
- `apps/api/src/service/auth-service.ts` — `authenticateWithGoogle` / `refreshTokens` / `logout`
- `apps/api/src/client/google-oauth.ts` — Google OAuth クライアント
- `apps/api/src/lib/jwt.ts` — JWT 発行・検証
- `apps/api/src/repository/redis/refresh-token-repository.ts` — refresh token の Redis 永続化（キーの接頭辞で一般ユーザーと admin を分ける）

**api (Express) の admin の認証**
- `apps/api/src/controller/admin/auth/` / `src/controller/admin/me/get.ts` — `/api/admin/auth/*` と `GET /api/admin/me`
- `apps/api/src/service/admin-auth-service.ts` / `src/service/admin-service.ts` — admin の Google 認証・dev ログイン・取得（refresh と logout は `auth-service.ts` を使う）
- `apps/api/src/lib/admin-jwt.ts` — admin の JWT 発行・検証
- `apps/api/src/middleware/admin-auth.ts` / `src/routes/admin-router.ts`（`mountAdminApi`） — admin の認証と mount
- `packages/db/drizzle/create-admin.ts` — `admin:create`（admin の登録）

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [`../auth.md`](../auth.md) | ①〜⑬ の完全なシーケンス図付き解説（正典） |
| [`../../apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md) | Admin API 設計方針（admin の認証）/ PUBLIC_PATHS |
| [`../spec/admin-template/README.md`](../spec/admin-template/README.md) | admin の認証の設計（`admins`・鍵の配布・proxy での更新） |
| [`../../apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md) | web の API 通信ルール（Server Component / Server Action / Route Handler の使い分け） |
