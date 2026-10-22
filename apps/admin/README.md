# Admin Dashboard

Next.js 16 (App Router) を使用した管理画面アプリケーション

## 目次

- [概要](#概要)
  - [技術スタック](#技術スタック)
- [ローカルで Google でサインインする](#ローカルで-google-でサインインする)
  - [うまくいかないとき](#うまくいかないとき)
- [アーキテクチャ](#アーキテクチャ)
  - [Route Group の構成](#route-group-の構成)
  - [ディレクトリ構成](#ディレクトリ構成)
  - [依存の方向](#依存の方向)
  - [設計原則](#設計原則)
  - [コンポーネントの分類基準](#コンポーネントの分類基準)
- [ブランドを変える](#ブランドを変える)
- [API 設計方針](#api-設計方針)
  - [API 通信方式](#api-通信方式)

## 概要

[TailAdmin](https://github.com/TailAdmin/free-nextjs-admin-dashboard) をベースに構築した管理画面ダッシュボードです。

- **ベースプロジェクト**: [TailAdmin Free Next.js Admin Dashboard](https://github.com/TailAdmin/free-nextjs-admin-dashboard)
- **プレビュー**: [https://nextjs-free-demo.tailadmin.com](https://nextjs-free-demo.tailadmin.com)
- **公式サイト**: [https://tailadmin.com](https://tailadmin.com)

### 技術スタック

- Next.js 16.x (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- ApexCharts（チャート。ダッシュボードとデモが使う）
- FullCalendar（カレンダー。デモだけが使う）

## ローカルで Google でサインインする

サインインできるのは、`admins` テーブルに email を登録した Google アカウントだけ。画面を見るだけなら Google の設定は要らない。サインイン画面の「dev admin でログイン」で、seed の `admin@dev.local` として入れる。

前提として、Postgres を起動して migration を流しておく（[`docs/setup/api.md`](../../docs/setup/api.md) の 4・5）。

1. **Google Cloud で OAuth クライアントを用意する**

   種類が「ウェブ アプリケーション」の OAuth クライアントを作り、「承認済みのリダイレクト URI」に `http://localhost:3030/api/auth/callback/google` を足す。admin は `NEXT_PUBLIC_APP_URL` の origin からこの URI を作り、Google は完全一致で照合する（各環境の値は [`CLAUDE.md` の「認証」](CLAUDE.md#認証)）。

   OAuth 同意画面がテスト中なら、サインインに使うアカウントをテストユーザーに足す。

2. **client ID と client secret を `.env.local` に入れる**

   admin と api に、同じクライアントの値を入れる。client secret は api だけが持つ。

   | ファイル | キー |
   | --- | --- |
   | `apps/admin/.env.local` | `GOOGLE_CLIENT_ID` |
   | `apps/api/.env.local` | `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET` |

   ```bash
   # プロジェクトルートで実行する（apps/* に cd してから実行すると .env.keys のシンボリックリンクが壊れる）
   npx dotenvx set GOOGLE_CLIENT_ID "<client ID>" -f apps/admin/.env.local
   npx dotenvx set GOOGLE_CLIENT_ID "<client ID>" -f apps/api/.env.local
   npx dotenvx set GOOGLE_CLIENT_SECRET "<client secret>" -f apps/api/.env.local
   ```

   env は起動したときにしか読まないので、`pnpm dev` を起動し直す。`.env.local` は暗号化してコミットしている、チームで共有のファイル。自分用のクライアントに差し替えたときは、チームで使うと決めるまでコミットしない。

3. **サインインする Google アカウントを `admins` に登録する**

   ```bash
   pnpm --filter @repo/db admin:create --email <Google アカウントの email>
   ```

   `DATABASE_URL` を渡さなければ、ローカルの dev DB（`localhost:5433` の `tech-english_dev`）に登録する。登録済みなら何もしない。dev / min / prd では GitHub Actions の「Admin Create」で登録する（[`docs/deploy/prd.md`](../../docs/deploy/prd.md#admin-を登録する)）。

4. **サインインする**

   `http://localhost:3030/signin` の「Google でサインイン」を押し、手順 3 で登録したアカウントを選ぶ。

### うまくいかないとき

| 症状 | 原因 |
| --- | --- |
| Google の画面に `redirect_uri_mismatch` が出る | 手順 1 の redirect URI が登録されていない。または `NEXT_PUBLIC_APP_URL` の origin と一致していない |
| Google の画面に `invalid_client` が出る | `apps/admin/.env.local` の `GOOGLE_CLIENT_ID` が間違っている。または env を変えた後に起動し直していない |
| Google の画面に `access_denied` が出て先に進めない | OAuth 同意画面がテスト中で、そのアカウントがテストユーザーに入っていない |
| サインイン画面に「このアカウントには管理画面の権限がありません」が出る | 選んだアカウントの email が `admins` に無い（手順 3）。または Google でその email が確認されていない |
| サインイン画面に「サインインに失敗しました」が出る | api が code を token に交換できなかった。api が起動しているか、api の `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET` が admin と同じクライアントのものかを確かめる |

## アーキテクチャ

### Route Group の構成

- **`(auth)/`** - 認証ページ（サイドバーなし、専用レイアウト）。サインイン画面（`/signin`。Google でのサインインと、production 以外の dev ログイン）と、デモのフォームの見本（`/demo/signin`・`/demo/signup`。サインインせずに開ける）
- **`(dashboard)/`** - 管理画面（サイドバー + ヘッダー付きレイアウト）

### ディレクトリ構成

```
src/
  app/                        # ルーティング + ページ構成（薄く保つ）
    (auth)/                   # 認証ページ（サイドバーなし、専用レイアウト）
      signin/                 #   サインイン画面（Google でのサインインを始める Server Action も）
      demo/                   #   デモ（サインイン・サインアップのフォームの見本。URL は /demo/...）
    (dashboard)/              # 管理画面（サイドバー + ヘッダー付きレイアウト）
      demo/                   #   デモ（TailAdmin の画面と UI 部品の見本。URL は /demo/...）
  components/
    ui/                       # 汎用UIコンポーネント（Button, Input等）
    layout/                   # レイアウト系（AppHeader, AppSidebar, Backdrop等）
      AdminShell.tsx          #   サイドバー・ヘッダー・本文の枠（client）。(dashboard)/layout.tsx が admin と通知を渡す
    features/                 # 機能固有のUIコンポーネント
      {feature}/              #   例: auth/GoogleSignInButton.tsx, dashboard/DashboardMetrics.tsx
    demo/                     # デモだけが使う部品・CSS・サイドバーの「デモ」の項目
  config/                     # アプリ名・言語・タイムゾーンなどの設定（app.ts）
  features/                   # ロジックのみ（レンダリングなし）
    {feature}/
      {feature}.context.tsx   #   状態管理（React Context）
    admin/                    #   サインイン中の admin の取得（admin.api.ts）と表示名
    notification/             #   ヘッダーの通知（今は空を返すスタブ）と、すべて既読にする Server Action
  hooks/                      # 共有カスタムフック
  icons/                      # SVGアイコン（@svgr/webpack）
  libs/                       # ユーティリティ（APIクライアント等）
```

### 依存の方向

```
app/ → components/ → features/(ロジック)
                   → hooks/
                   → icons/
```

上位から下位への一方向のみ。`features/`（ロジック）はUIに依存しない。

### 設計原則

| 原則 | 内容 |
|---|---|
| **ルートファイルは薄く** | `app/`にはビジネスロジックを書かず、コンポーネントの組み合わせのみ |
| **features/ = ロジック層** | 状態管理・型定義を機能単位で凝集。レンダリングは持たない |
| **components/ = UI層** | 見た目を担当。`features/`のロジックはprops経由で受け取る |
| **状態管理はfeatures内** | Context等のstateは各featureに配置 |

### コンポーネントの分類基準

| 層 | 配置するもの | 依存ルール |
|---|---|---|
| **ui/** | propsだけで動く汎用パーツ。ビジネスロジックを持たない | 他の層に依存しない |
| **features/** | 特定のドメイン・機能に紐づくコンポーネント | `ui/`と`layout/`を使ってよい |
| **layout/** | ページの構造やレイアウトを決めるコンポーネント | `ui/`を使ってよい |

**判断基準:** ドメイン知識なしで動く → `ui/` / レイアウト系 → `layout/` / それ以外 → `features/{domain}/`

## ブランドを変える

| 変えるもの | 場所 |
| --- | --- |
| アプリ名・説明・言語・タイムゾーン | `src/config/app.ts`。サイドバー・スマホ幅のヘッダー・サインイン画面のロゴの文字と、タブのタイトル（`<ページ名> \| <アプリ名>`）がここから決まる。日時の表示（`src/libs/date.ts`）もここのタイムゾーンで出す |
| ロゴ | `src/components/layout/AppLogo.tsx`。アプリ名の頭文字のアイコン + アプリ名。画像のロゴにするときは中身を `<Image>` に差し替える（呼び出し側は変えない） |
| favicon | `public/favicon.svg`（`src/app/layout.tsx` の `metadata.icons` で指している） |
| ブランドの色 | `src/app/globals.css` の `@theme` の `--color-brand-*` |

## API 設計方針

- Admin が利用する API はすべて `/api/admin/` プレフィックスを付与する

### API 通信方式

ブラウザから Express API を直接 fetch しない。Next.js の Server Components / Server Actions / Route Handlers を経由してサーバー間通信する。

**メリット:**
- CORS 設定が不要（サーバー間通信のため）
- 認証トークンをサーバー側で管理できる
- Express API を内部ネットワークに閉じられる

#### データ取得（GET）

| 用途 | 方式 | 例 |
|------|------|----|
| ページの初期データ表示 | Server Component で `apiClient.get()` | ダッシュボード、一覧テーブル |
| Client Component からの動的データ取得 | Route Handler (`app/api/*/route.ts`) | タブ切替、検索、モーダル内の詳細取得 |

#### データ変更（POST/PUT/DELETE）

| 用途 | 方式 | 例 |
|------|------|----|
| フォーム送信・ボタンによる CRUD | Server Action (`"use server"`) | 作成・更新・削除モーダル |
| Server Action が適さない場合 | Route Handler | ファイルアップロード等 |

