# step2-admin-app-config

アプリ名・説明・言語・ロケール・タイムゾーンを `src/config/app.ts` にまとめ、ロゴ・タブのタイトル・`lang`・favicon をそこから決める。日時の表示を `libs/date.ts` の 1 か所にまとめる。TailAdmin のブランド（ロゴの画像・favicon・文言）を土台から消す。

設計: [アプリの設定と日時の表示](../README.md#アプリの設定と日時の表示) / [仕様: アプリ名・ロゴ・日時の表示](../README.md#アプリ名ロゴ日時の表示)

## 前提

- [step1](./step1-admin-demo-isolation.md) の後（デモのページは `/demo` に移っている）
- この step のパスは、特に書かない限り `apps/admin/src/` からの相対

## 対応内容

### 変更するファイル

```
apps/admin/src/
├── config/app.ts                         # 新設
├── libs/date.ts                          # libs/format-date.ts を移して書き換える
├── components/layout/AppLogo.tsx         # 頭文字のアイコン、tone を足す
├── app/layout.tsx                        # metadata・lang・フォント
├── app/global-error.tsx                  # lang
├── app/not-found.tsx                     # © の表記
├── app/favicon.ico                       # 削除（TailAdmin）
├── app/globals.css                       # フォントのフォールバック
├── app/(auth)/layout.tsx                 # ロゴ・説明文・ThemeProvider の二重の囲み
├── app/**/page.tsx                       # metadata をページ名だけに
├── proxy.ts                              # matcher の favicon.ico を favicon.svg に
└── format-date を import している 10 ファイル
apps/admin/public/favicon.svg             # 新設
apps/admin/public/images/logo/            # 削除（TailAdmin のロゴ 4 枚）
```

### `src/config/app.ts`

```typescript
export const appConfig = {
  description: "tech-english の管理画面",
  lang: "ja",
  locale: "ja-JP",
  name: "tech-english admin",
  timeZone: "Asia/Tokyo",
} as const
```

- client component からも import する（秘密の値は置かない。env は `src/env.ts`）
- 実装では、各項目がどこに出るか（`name` はロゴとタブのタイトル、`timeZone` は日時の表示）を定義の側に書く。テンプレートの `config/app.ts` と同じ

### `AppLogo`

今の props（`className`・`isCompact`。押すとダッシュボードへ）は残す。画像を頭文字のアイコンに替え、サインイン画面の暗い背景用に `tone` を足す。

```tsx
import Link from "next/link"

import { appConfig } from "@/config/app"

const HOME_PATH = "/"

type AppLogoProps = {
  className?: string
  isCompact?: boolean
  tone?: "default" | "inverse"
}

export function AppLogo({ className, isCompact = false, tone = "default" }: AppLogoProps) {
  return (
    <Link aria-label={isCompact ? appConfig.name : undefined} className={`flex items-center gap-2.5 ${className ?? ""}`} href={HOME_PATH}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-white">
        {appConfig.name.charAt(0).toUpperCase()}
      </span>
      {!isCompact && (
        <span className={`text-lg font-semibold ${tone === "inverse" ? "text-white" : "text-gray-900 dark:text-white"}`}>
          {appConfig.name}
        </span>
      )}
    </Link>
  )
}
```

- 文字の大きさと色は今のロゴの文字（`text-lg font-semibold text-gray-900 dark:text-white`）のまま。アイコンは今のロゴの画像と同じ 32px
- 画像のロゴに戻したくなったら、この部品の中身だけを `<Image>` に差し替える（呼び出し側は変えない）

使う場所:

| 場所 | 今 | 変更後 |
| --- | --- | --- |
| サイドバー（開いている / 折りたたみ） | `<AppLogo />` / `<AppLogo isCompact />`（画像） | 同じ呼び出し（中身が頭文字のアイコンになる） |
| ヘッダー（スマホ幅） | `<AppLogo className="lg:hidden" />` | 同じ |
| サインイン画面の右側（`(auth)/layout.tsx`） | `./images/logo/auth-logo.svg` と「Free and Open-Source Tailwind CSS Admin Dashboard Template」 | `<AppLogo tone="inverse" />` と `appConfig.description` |

`public/images/logo/` は使う所が無くなるので消す。

### タブのタイトル・`lang`・favicon・フォント

`app/layout.tsx`:

```tsx
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit-loaded",
})

export const metadata: Metadata = {
  description: appConfig.description,
  icons: { icon: "/favicon.svg" },
  title: {
    default: appConfig.name,
    template: `%s | ${appConfig.name}`,
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={outfit.variable} lang={appConfig.lang}>
      <body className="dark:bg-gray-900">
        <ThemeProvider>
          <SidebarProvider>{children}</SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

`app/globals.css` の `@theme`:

```css
--font-outfit: var(--font-outfit-loaded), "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
```

- Outfit は欧文だけなので、日本語は Hiragino Sans / Noto Sans JP に落とす。`--font-outfit` は `@theme` で `:root`（= `<html>`）に出るので、`outfit.variable` は **`<html>`** に付ける。`<body>` に付けると `:root` から `--font-outfit-loaded` が見えず、`--font-outfit` ごと無効になる（この理由は実装の `app/layout.tsx` に 1 か所だけ書く）
- 本文の書体は今と同じく `globals.css` の `body { @apply font-outfit }` で決まる。`<body>` の `outfit.className` は外す
- `--font-sans`（モックが使う）は変えない
- favicon は `app/favicon.ico`（TailAdmin）を消し、`public/favicon.svg` を置く。中身は `AppLogo` のアイコンと同じ見た目の SVG（`brand-500` の角丸の正方形に白い「T」）。`app/icon.svg` にしない理由は [README](../README.md#アプリの設定と日時の表示)
- `proxy.ts` の matcher の `favicon.ico` を `favicon.svg` にする（step5 で proxy を置き換えるときも同じ値）
- `app/global-error.tsx` の `<html lang="en">` を `appConfig.lang` にする
- `app/not-found.tsx` の `© {year} - TailAdmin` を `appConfig.name` にする
- `app/(auth)/layout.tsx` は、ロゴと説明文の差し替えに加えて、`ThemeProvider` の二重の囲みを消す（root の layout が既に囲んでいる）

### 各ページの `metadata`

`title` にページ名だけを書く。TailAdmin の `description` は消す。

| ページ | `title` |
| --- | --- |
| `/` | ダッシュボード |
| `/passages`・`/passages/[id]` | 問題・問題の確認・修正 |
| `/analytics/passages/[id]` | 問題の分析 |
| `/content-sources`・`/content-sources/new`・`/content-sources/[id]` | ソース・ソースの登録・ソースの編集 |
| `/tags` | タグ |
| `/users`・`/users/[id]` | ユーザー・ユーザーの詳細 |
| `/signin`（今は TailAdmin のフォーム。step5 で作り直す） | Sign In |
| デモ（`/demo/...`） | 英語のページ名（`Bar Chart`・`Calendar`・`Ecommerce` など） |

### 日時の表示（`src/libs/date.ts`）

`libs/format-date.ts` を `git mv` で `libs/date.ts` にし、次を変える。書式（`YYYY-MM-DD HH:mm`）とタイムゾーンごとの書式の使い回しは今のまま。

```typescript
import { appConfig } from "@/config/app"

export const formatDateTime = (value: string | Date, timeZone: string = appConfig.timeZone): string => {
  const parts = Object.fromEntries(
    getDateTimeFormat(timeZone)
      .formatToParts(typeof value === "string" ? new Date(value) : value)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

export const formatDate = (value: string | Date, timeZone: string = appConfig.timeZone): string =>
  formatDateTime(value, timeZone).slice(0, 10)
```

- `DEFAULT_TIME_ZONE`（`"Asia/Tokyo"` の直書き）を消し、既定を `appConfig.timeZone` にする
- `getDateTimeFormat` の `Intl.DateTimeFormat` のロケールを `appConfig.locale` にする
- 引数は ISO 8601 の文字列に加えて `Date` も受け取る（step6 のマイページ・通知で使う）
- import している 10 ファイルの `@/libs/format-date` を `@/libs/date` に直す（`analytics/passages/[id]/page.tsx`、`content-source/SourceTable.tsx`・`SourceForm.tsx`、`user/UserTable.tsx`・`UserAttemptList.tsx`・`UserProfileCard.tsx`、`passage/PassageAudioCard.tsx`・`PassageTable.tsx`・`PassageReview.tsx`、`stats/PassageStatsTable.tsx`）
- `UserAttemptList` はユーザーのタイムゾーンを渡したまま（`formatDateTime(attempt.submitted_at, timeZone)`）

### ドキュメント

- `apps/admin/CLAUDE.md`
  - 「API 接続の下地」の表の `src/libs/format-date.ts` の行を `src/libs/date.ts` にする（既定のタイムゾーンは `appConfig.timeZone`、ユーザーの学習履歴はユーザーのタイムゾーンを渡す）
  - ロゴの説明（「テンプレートのマークと「tech-english-admin」の文字」）を、`src/config/app.ts` の `name` の頭文字のアイコンと文字に直す
  - アプリ名・タブのタイトルは `src/config/app.ts` で変える、各ページの `metadata.title` はページ名だけを書く、と足す
- `apps/admin/README.md`：「ブランドを変える」を足す（`src/config/app.ts`、`AppLogo`、`public/favicon.svg`、ブランドの色は `globals.css` の `@theme` の `--color-brand-*`）

## 動作確認

```bash
pnpm --filter admin lint
pnpm --filter admin build
grep -rn --exclude-dir=demo --exclude-dir=mock "TailAdmin\|pimjo" apps/admin/src
grep -rn "| tech-english admin\|format-date" apps/admin/src
```

- 1 つめの `grep` は、ヘッダーの `UserDropdown`（step6 で作り直す）と `/signin`（step5 で作り直す）のほかに何も返さないこと（デモは TailAdmin のまま残す）
- 2 つめの `grep` は何も返さないこと

`verify-web-page` skill で確かめる。

| 確認 | 期待 |
| --- | --- |
| サイドバー（開いている / 折りたたみ / ホバーで開く） | 「T」のアイコン + 「tech-english admin」/ アイコンだけ |
| スマホ幅で `/demo/charts/bar` を開く | ヘッダーにロゴが出る |
| `/signin` の右側 | 白い文字のロゴと「tech-english の管理画面」 |
| タブのタイトル | `/` は「ダッシュボード \| tech-english admin」、`/demo/charts/bar` は「Bar Chart \| tech-english admin」 |
| `src/config/app.ts` の `name` を `"Sample"` に変える | ロゴとタイトルがすべて変わる（確かめた後に戻す） |
| favicon | 新しいアイコン |
| 日本語の文字 | 土台の画面の日本語が Hiragino Sans（mac）/ Noto Sans JP で出る（`getComputedStyle(document.body).fontFamily` に Outfit と日本語のフォールバックが並ぶ） |
| 日時 | 問題一覧・ソース一覧・ユーザーの詳細の日時が今と同じ文字列（`2026-10-15 09:00`）。ユーザーの学習履歴はユーザーのタイムゾーン |
| ダークモード | ロゴの文字が白 |

PR には、サイドバー・サインイン画面・スマホ幅のヘッダーの変更前後のスクリーンショットを付ける。
