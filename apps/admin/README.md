# Admin Dashboard

Next.js 16 (App Router) を使用した管理画面アプリケーション

## 目次

- [概要](#概要)
  - [技術スタック](#技術スタック)
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
    features/                 # 機能固有のUIコンポーネント
      {feature}/              #   例: auth/GoogleSignInButton.tsx, dashboard/DashboardMetrics.tsx
    demo/                     # デモだけが使う部品・CSS・サイドバーの「デモ」の項目
  config/                     # アプリ名・言語・タイムゾーンなどの設定（app.ts）
  features/                   # ロジックのみ（レンダリングなし）
    {feature}/
      {feature}.context.tsx   #   状態管理（React Context）
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

