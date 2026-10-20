# apps/api

Express.js API サーバー（port 8080）。

## Commands

```bash
pnpm dev           # ホットリロード起動
pnpm test          # ローカル用（dotenvx で .env.local を復号して vitest run）
pnpm test:ci       # CI 用（env は外部から渡す前提。migrate + vitest run）
pnpm test:watch    # 変更ファイルだけ再実行
pnpm test:coverage # カバレッジ計測（coverage/ に出力）
pnpm db:seed:sample-passages # 開発用のサンプル問題（公開 1・下書き 2）を dev DB に入れる。何度流してもよい（状態と内容が初期値に戻る）
```

テストランナーは Vitest。`describe` / `it` / `expect` / `vi` は `globals: true` で展開済みなので import 不要。

## レイヤード構成

`Router → Controller → Service → Repository → (Drizzle / Redis)`

**新機能は必ず既存実装を読んでパターンを合わせる**: `src/routes/memo-router.ts` / `src/controller/memo/` / `src/service/memo-service.ts` / `src/repository/drizzle/memo-repository.ts`。

| レイヤー | 場所 | 守ること |
| --- | --- | --- |
| Router | `src/routes/` | controllers は optional なオブジェクトで受け、存在する場合のみルート登録 |
| Controller | `src/controller/{feature}/` | API と 1 対 1。**try-catch を書かない**。`Result` は必ず `sendError` 経由で返す |
| Service | `src/service/` | `export const` のアロー関数。**戻り値は必ず `Promise<Result<T>>`** |
| Repository | interface は `src/repository/`、実装は `src/repository/drizzle/` `src/repository/redis/` | **service / controller は `src/repository` バレルから interface だけ import する**（実装ディレクトリから import しない）。**DB の repository を足すときは `test/repository/` に実 DB で検証するテストを加える** |
| Domain 型 | `@repo/domain` | api / cron / worker で共有。`@repo/api-schema` にも Drizzle にも依存しない |

- **Service の Repository 引数は単一でも `repo: { xxxRepository }` のオブジェクトにまとめる**。将来 Repository が増えてもシグネチャを変えずに済むため
- **DI は `src/index.ts`** で Repository → Controller → Router の順に組み立てる。実装クラスを import してよいのはここと Controller インテグレーションテストだけ
- **トランザクション**: 抽象は `src/repository/transaction.ts`、実装は `src/repository/drizzle/transaction-runner.ts`。`TransactionContext` は不透明トークンなので、service から `tx` で直接クエリを書くことはできない（型エラーになる）
- **read replica**: `DATABASE_REPLICA_URL` があると、tx の外の読み取りは read replica に流れる。書き込みの直後・同時操作で書き込めなかった後の読み直しなど、replica の遅れが許されない読み取りは `ReadOptions`（`{ fromPrimary: true }`）を受ける Repository メソッドで primary から読む（`this._db.$primary` を使う。例: `ReadingAttemptRepository`）

## 行動イベントの送出

`@repo/events` の `EventTracker` を service の第 3 引数（`deps`）で受け取り、**操作が成功したときだけ**記録する。失敗を記録したい場合は別イベントにする（成功イベントに成否フラグを混ぜると集計時に事故る）。

- **送出は `await` しない。** `EventTracker.track()` の戻り値は `void` で、失敗は実装側が catch する
- **`userId` は `findUserId(req)` で取り出す。** `/api/memo` のように `PUBLIC_PATHS` に含まれるパスは未ログインでも呼べるため `undefined` になりうる。**匿名ユーザーは追跡しない方針**なので、その場合は送出をスキップする
- **auth middleware は公開パスでも optional 認証を行う。** トークンがあれば `req.userId` を埋め、無くても 401 にしない。早期 return すると公開パスで有効なトークンを渡しても userId が入らず、イベントが永久に記録されない
- `POST /api/events` は `PUBLIC_PATHS` に含めない（認証必須）。`userId` はボディから受け取らず server 側で解決する

設計: `docs/spec/user-behavior-events/README.md`

## エラーハンドリング（Result 型）

`@repo/errors` の `Result<T>` を使う。**業務エラー（4xx）は値で返し、想定外エラー（DB 障害等）は throw する**、が原則。

- **Service**: 業務エラーは `return err(conflictError(...))`。想定外エラーは **catch せずそのまま伝播させる**
- **Controller**: **try-catch を書かない**。`if (!result.ok)` は必ず `sendError`（`src/lib/send-error.ts`）経由で返す。`res.status().json()` を直接書くとログを書き忘れるため
- Service から別 Service を呼ぶときも `ok` 判定し、そのまま re-return するか再解釈する（例: pre-condition の 404 を 400 に変換）
- 原因が複数ある 400 は `badRequestError(message, details)` で `ApiErrorDetail[]`（`{ code, message, path }`）を付ける。`sendError` がレスポンスの `details` に含める（admin の問題の公開の条件の検査など。テストは `code` と `path` を検証し、`message` は検証しない）
- 想定外の throw / スキーマ違反は `src/middleware/unhandled-exception-handler.ts` が処理する（リクエストスキーマ違反 → 400 + `warn`、レスポンススキーマ違反とその他 → 500 + `error`）

try/catch を許容するのは次の 2 つだけ。

- **副次処理の意図的な握りつぶし**: 通知送信の失敗などメイン処理を成功扱いにしたい場合。`logger.warn` してから続行する
- **エラーを値に変換する必要がある場合**: `health-service` が個別のサービスチェック失敗を `status: "error"` に集約して必ず両方の status を返す、など

## テスト戦略

参考にする実装: `test/service/memo-service/`（ユニット）/ `test/controller/memo/`（インテグレーション）。

- **Service はユニットテスト**（`vi.fn()` で Repository をモック、DB 不要）、**Controller はインテグレーションテスト**（`supertest` で HTTP レイヤーから検証）
- **`describe` を「正常系」「異常系」で必ず分類する**。トップレベルはテスト対象（関数名 / エンドポイント）にし、その直下に分類の `describe` を置く。異常系の抜け漏れに気付きやすくするため
- **自前インフラ（Postgres / Redis）はモックしない**。キー名・TTL・型変換・SQL の誤りは mock では検出できない。**実 Redis を `vi.fn()` で差し替えるのは禁止**。モックしてよいのは外部 SaaS（Google OAuth / S3 / 課金 API）だけ
- **エラーメッセージ等の文字列は assertion しない**。文言変更・i18n・ログ改善のたびに無関係なテストが落ちるため。Service は `Result` の構造（`ok` / `statusCode` / `type`）、Controller は HTTP ステータスとボディの存在のみ検証する
- **アサーションは最終状態まで含める**。呼び出し回数だけでなく DB / Redis の結果まで確認する
- **オブジェクトは一括 assertion にする**。API レスポンス（外部契約）は `toEqual` + `expect.any(...)`（フィールド増減で落ちる方が望ましい）、DB 行（内部状態）は `toMatchObject`
- **境界値テストは必須**（日付フィルタの境界、条件分岐の境界）

## Admin API 設計方針

admin（`apps/admin`）のサーバー側だけが呼ぶ API。一般ユーザーの API と認証を完全に分ける（設計: [admin-template の「admin 認証」](../../docs/spec/admin-template/README.md#admin-認証)）。

- すべて `/api/admin/` 配下に置き、`src/routes/admin-router.ts` にマッピングする。コントローラーはリソースごとに `controllers.contentSource` / `controllers.passage` のようにネストして渡し、既存の router と同じく渡されたものだけを登録する
- **`/api/admin` の下のルートは必ず admin-router に足す**（別の router に足すと admin の認証を通らない）
- **認証は Bearer の admin の JWT**。admin は `admins` テーブル（`users` とは別。事前登録制）で、トークンは admin 専用の鍵（`JWT_ADMIN_ACCESS_SECRET` / `JWT_ADMIN_REFRESH_SECRET`）で署名し、payload は `{ adminId }`（発行・検証は `src/lib/admin-jwt.ts`）。refresh の jti は Redis の `admin_refresh_token:{jti}`（猶予は `admin_refresh_token_rotated:{jti}`）
- **`adminAuthMiddleware`（`src/middleware/admin-auth.ts`）は全体ではなく `/api/admin` の mount の中に置く**。`src/index.ts` とテストは `mountAdminApi`（`src/routes/admin-router.ts`）で mount する。Express 5 の mount と Router は大文字小文字を区別しないので、全体に適用して文字列で比べると `/API/Admin/...` が判定をすり抜ける。一般ユーザーの `authMiddleware` は `/api/admin` を見ない
- admin の access token を求めないパスは `ADMIN_PUBLIC_PATHS`（`src/const/index.ts`。mount からの相対で、完全一致で比べる。google / refresh / logout と、production 以外の dev-login）
- Controller は `src/controller/admin/{resource}/{action}.ts`。Service は `src/service/{content-source,admin-passage,admin-stats,admin-user,url-import}-service.ts` と、認証の `admin-auth-service.ts`（Google・dev ログイン）・`admin-service.ts`（`GET /api/admin/me`）。ユーザー向けと同じ Repository を使う（ダッシュボードの集計だけは admin 専用の `AdminStatsRepository`。生の SQL で Postgres をその場で集計する。[admin-dashboard](../../docs/spec/admin-dashboard/README.md)）
- admin の refresh / logout は一般ユーザーの `service.auth.refreshTokens` / `service.auth.logout` に admin 用の Repository・検証関数・発行関数を渡す。`refreshTokens` は持ち主を `tokenOwnerRepository` で確かめるので、admin は `adminRepository` を渡す（`admins` から消された admin の refresh token は 401）
- ユーザー管理（`/api/admin/user/*`）はマイページの Service を使い回す。マイページの Service はユーザーが居ないと 401 を返すので、admin の Service（`admin-user-service.ts`）が先に存在を確かめて 404 にする
- スキーマは `@repo/api-schema` の `admin/` に集約。既存と同一なら re-export し、Admin 固有のレスポンスが必要になった時点で新規定義する
- **admin の登録**: `pnpm --filter @repo/db admin:create --email <email>`。本番は GitHub Actions の「Admin Create」（`docs/deploy/prd.md`）。ローカルは seed で `admin@dev.local` が入り、`POST /api/admin/auth/dev-login` でログインできる（dev-login は `@dev.local` の admin しか受け付けない）

## 環境変数

`src/env.ts` に Zod スキーマをインラインで定義し、import 時に `safeParse` → 失敗なら `process.exit(1)`。値は `.env.local` に置き dotenvx で暗号化して git にコミットする（復号鍵は root の `.env.keys`）。

```bash
# 値の追加・変更は手書きせず dotenvx を使う
pnpm exec dotenvx set KEY "value" -f .env.local
```

`JWT_ADMIN_ACCESS_SECRET` / `JWT_ADMIN_REFRESH_SECRET`（必須・32 文字以上）は admin の JWT の鍵。`openssl rand -hex 32` などで作る。**JWT の鍵 4 つ（`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ADMIN_ACCESS_SECRET` / `JWT_ADMIN_REFRESH_SECRET`）は別の値にする**（同じ値があれば `src/env.ts` が起動を止める）。

`GITHUB_LICENSE_TOKEN`（任意）は admin のソース登録で GitHub のライセンスを検出するときに使う。未設定でも動くが、GitHub の rate limit（60 回 / 時）が低くなる。

`COLLECT_WEB_CONTACT_URL`（任意）は admin の URL の取り込みでサイトに送る User-Agent に入れるサービスのトップの URL（`TechEnglishBot/1.0 (+{url})`）。未設定なら `FRONTEND_URL`（web のトップ）を使うので、ふつうは設定しなくてよい。

読み上げ（[read-aloud](../../docs/spec/read-aloud/README.md#音声の保存と配信)）の音声の env:

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `AUDIO_PUBLIC_URL_BASE` | なし（任意の URL。空文字は未設定と同じ） | `GET /api/attempt/:id/audio` が返す mp3 の URL の base（マニフェストのキーとつなぐ）。本番は CloudFront の URL。未設定なら、開発では `http://localhost:${PORT}/media`、`production` では null（音声 API は `pending` を返し、起動時に warn。infra より先に出しても起動は止めない）。mobile の実機で確かめるときは `http://<PC の LAN の IP>:8080/media` |
| `AUDIO_STORAGE_LOCAL_DIR` | `../../.storage/audio` | `/media` の配信元（`apps/api` からの相対。cron の `generate:audio` の保存先と同じリポジトリ直下の `.storage/audio/`） |

**`/media/*` は開発環境だけ**の配信（cron が書いた mp3。本番は S3 + CloudFront）。dev-login と同じくガードを 1 か所に集めない：`src/index.ts` は `production` で `mediaRouter` を登録せず、`DEV_ONLY_PUBLIC_PATHS`（`<audio>` は Authorization ヘッダを付けられないので認証の対象外にする）も `production` では `/media` を含めず、`src/routes/media-router.ts` も先頭で `production` なら 404 にする。Range のリクエストが続くので `apiRateLimiter` より前に登録し、helmet の `Cross-Origin-Resource-Policy` はこの router だけ `cross-origin` に上書きする（別オリジンの web の `<audio>` が読めるように）。

## サイトのページの取得（`@repo/content-extractor`）

admin の URL の取り込み（`POST /api/admin/url-import`・`/preview`。[url-import](../../docs/spec/url-import/README.md)）は、cron の収集と同じ `@repo/content-extractor` でページを取得・抽出する（取得先の制限・robots.txt・本文の抽出を cron と同じにする）。

- パッケージは `src/client/page-fetcher.ts` の中で、使うときに `import()` で読む。jsdom などが重く、ほかの API のコールドスタートを遅くしないため。service・Repository は型だけを import する
- パッケージは CommonJS で、ESM だけで配布されている unified などを Node の `require(esm)` で読むので、**Node 20.19 以上**が要る（Docker は `node:20-slim`）。vitest と tsx はこの経路を通らないので、Node のバージョンを変えるときはビルドした dist で読めることを確かめる（[step3 の動作確認](../../docs/spec/url-import/tasks/step3-api-url-import.md#動作確認)）
- 取得は始めてから 15 秒で打ち切る（API Gateway と Lambda の 29 秒に、抽出・DB・コールドスタートの分を残して収めるため）。期限・Crawl-delay の上限・リクエストの間隔は `page-fetcher.ts` の定数
- 取得・抽出したページは Redis（`url_import_page:*`、10 分）に置き、確認と保存で使い回す（`IoRedisUrlImportPageCacheRepository`）。キャッシュの読み書きに失敗しても取得して進める
- api はパッケージの `dist` を読むので、パッケージを変えたら `pnpm --filter @repo/content-extractor build` してから起動・テストする

## レート制限

`apiRateLimiter`（`src/middleware/rate-limit.ts`）が API 全体に 1 分 300 回の上限をかける（in-memory でインスタンス単位）。`/api/health` と開発用の `/media` は limiter より前に登録して対象外にする。

- **数え方**: Authorization の Bearer の access token を検証できれば `user:<userId>`、`POST /api/auth/refresh` は body の refresh token を検証できればそのユーザー、どちらも無い・検証できなければ `ip:<IP>`（`trust proxy` を反映した `req.ip`）。検証は `lib/jwt.ts` で署名と期限を見るだけで、DB / Redis は引かない
- **理由**: web の Server Component・Route Handler・proxy からの呼び出しはすべて web サーバーの IP から来るため、IP だけで数えると全ユーザーで上限を分け合ってしまう。token の無い・検証できないリクエストは IP で数え、総当たりへの備えは弱めない
- admin の API（`/api/admin/*`）のトークンは一般ユーザーの鍵では検証できないので、admin のサーバーの IP で数える（管理者は 1〜2 人なので 1 分 300 回で足りる）
- refresh の body を読むので **`express.json()` より後に登録する**
- IPv6 はアドレスごとに数える（express-rate-limit 7.x の既定と同じ。サブネットでまとめる `ipKeyGenerator` は 8.x から）

## 新エンドポイント追加の手順

1. `@repo/api-schema` にスキーマを定義（命名規則は `packages/schema/CLAUDE.md`）
2. Domain 型 → Repository → Service → Controller → Router の順に実装
3. `src/index.ts` の DI 組み立てに追加
4. Service のユニットテストと Controller のインテグレーションテストを書く
