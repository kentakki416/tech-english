# step1-admin-demo-isolation

TailAdmin のデモの画面と、デモだけが使う部品・画像・CSS を `/demo` の下にまとめ、土台から切り離す。サイドバーを「メニュー」と「デモ」のセクションに分ける。使っていない依存・画像・型定義は消す。

見た目は変えない。デモの URL が `/demo/...` に変わり、サイドバーに「デモ」が増えるだけ。

設計: [デモの置き場所](../README.md#デモの置き場所) / [サイドバー](../README.md#サイドバー) / [仕様: デモと土台](../README.md#デモと土台)

## 前提

- ほかの step に依存しない。最初に出す
- Basic 認証は step5 まで残る。画面の確認は今と同じく Basic 認証を通って行う
- この step のパスは、特に書かない限り `apps/admin/src/` からの相対（`public/` と設定ファイルは `apps/admin/` から）

## 対応内容

### ページの移動

`git mv` で移す（中身は import のパスだけ直す）。

| 今 | 移動先（URL） |
| --- | --- |
| `app/(dashboard)/{blank,calendar,profile}/` | `app/(dashboard)/demo/{blank,calendar,profile}/`（`/demo/blank` など） |
| `app/(dashboard)/charts/{bar,line,pie,radar}/` | `app/(dashboard)/demo/charts/...` |
| `app/(dashboard)/forms/elements/` | `app/(dashboard)/demo/forms/elements/` |
| `app/(dashboard)/tables/basic/` | `app/(dashboard)/demo/tables/basic/` |
| `app/(dashboard)/ui/{alerts,avatars,badge,buttons,images,modals,videos}/` | `app/(dashboard)/demo/ui/...` |
| `app/(auth)/signup/` | `app/(auth)/demo/signup/`（`/demo/signup`） |

- `app/(dashboard)/page.tsx`（ダッシュボード）は土台なので移さない
- `app/(auth)/signin/` は残す。step5 でサインイン画面を作り直すときに、今のフォームを `/demo/signin` に移す
- `/profile` は空く。step6 でマイページを置くまで 404 になる

新しく作るページ。`app/(dashboard)/demo/layout.tsx`:

```tsx
import React from "react"

import "@/components/demo/demo.css"

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

- `app/(dashboard)/demo/ecommerce/page.tsx`：テンプレートの同じファイルを写す。今どこからも表示していない `components/features/ecommerce/` の部品（移動先は下の表）を並べる EC のダッシュボードの見本。`metadata.title` は `"Ecommerce"`（step2 で title の template を入れるまでは、ほかのデモのページと同じ書き方にそろえる）

### 部品の移動

| 今 | 移動先 | 理由 |
| --- | --- | --- |
| `components/features/ecommerce/` | `components/demo/ecommerce/` | サンプルのデータ |
| `components/features/example/` | `components/demo/example/` | 見本 |
| `components/features/calendar/` | `components/demo/calendar/` | サンプルの予定 |
| `components/features/user-profile/` | `components/demo/user-profile/` | 固定の人物（Musharof） |
| `components/features/auth/SignUpForm.tsx` | `components/demo/auth/SignUpForm.tsx` | admin にサインアップは無い |
| `components/ui/charts/` | `components/demo/charts/` | props が無く、系列と色が固定 |
| `components/ui/images/` | `components/demo/images/` | props が無く、画像が固定 |
| `components/ui/ChartTab.tsx` | `components/demo/ecommerce/ChartTab.tsx` | ecommerce だけが使う |
| `components/features/videos/` | 削除 | どこからも import されていない |

- `components/features/auth/SignInForm.tsx` は step5 で `components/demo/auth/` に移す
- `components/ui/` の props で動く部品（alert・avatar・badge・button・dropdown・form・modal・table・video）と `components/layout/` は土台に残す。`ui/form/DatePicker`（flatpickr）・`ui/table/DataTable`・`Pagination`・`LinkTableParts` も土台
- `/mock`（`app/(dashboard)/mock/`）は土台の扱いのまま動かさない。デモの部品を import していないことを lint で確かめる

### サイドバー

`AppSidebar.tsx` の中の `navItems` を、見出し付きのセクションの配列にする。

`components/layout/nav-items.tsx`:

```tsx
import React from "react"

import { DocsIcon, FolderIcon, GridIcon, ListIcon, UserCircleIcon } from "@/icons"

export type NavItem = {
  icon: React.ReactNode
  name: string
  path?: string
  subItems?: { name: string, path: string }[]
}

export type NavSection = {
  items: NavItem[]
  title: string
}

export const mainNavSection: NavSection = {
  items: [
    { icon: <GridIcon />, name: "ダッシュボード", path: "/" },
    { icon: <DocsIcon />, name: "問題", path: "/passages" },
    { icon: <FolderIcon />, name: "ソース", path: "/content-sources" },
    { icon: <ListIcon />, name: "タグ", path: "/tags" },
    { icon: <UserCircleIcon />, name: "ユーザー", path: "/users" },
  ],
  title: "メニュー",
}
```

`components/demo/demo-nav-items.tsx`:

```tsx
import React from "react"

import type { NavSection } from "@/components/layout/nav-items"
import {
  BoxCubeIcon,
  CalenderIcon,
  GridIcon,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  UserCircleIcon,
} from "@/icons"

export const demoNavSection: NavSection = {
  items: [
    { icon: <GridIcon />, name: "Dashboard", subItems: [{ name: "Ecommerce", path: "/demo/ecommerce" }] },
    { icon: <CalenderIcon />, name: "Calendar", path: "/demo/calendar" },
    { icon: <UserCircleIcon />, name: "User Profile", path: "/demo/profile" },
    { icon: <ListIcon />, name: "Forms", subItems: [{ name: "Form Elements", path: "/demo/forms/elements" }] },
    { icon: <TableIcon />, name: "Tables", subItems: [{ name: "Basic Tables", path: "/demo/tables/basic" }] },
    { icon: <PageIcon />, name: "Pages", subItems: [{ name: "Blank Page", path: "/demo/blank" }] },
    {
      icon: <PieChartIcon />,
      name: "Charts",
      subItems: [
        { name: "Line Chart", path: "/demo/charts/line" },
        { name: "Bar Chart", path: "/demo/charts/bar" },
        { name: "Pie Chart", path: "/demo/charts/pie" },
        { name: "Radar Chart", path: "/demo/charts/radar" },
      ],
    },
    {
      icon: <BoxCubeIcon />,
      name: "UI Elements",
      subItems: [
        { name: "Alerts", path: "/demo/ui/alerts" },
        { name: "Avatar", path: "/demo/ui/avatars" },
        { name: "Badge", path: "/demo/ui/badge" },
        { name: "Buttons", path: "/demo/ui/buttons" },
        { name: "Images", path: "/demo/ui/images" },
        { name: "Videos", path: "/demo/ui/videos" },
      ],
    },
    {
      icon: <PlugInIcon />,
      name: "Authentication",
      subItems: [
        { name: "Sign In", path: "/signin" },
        { name: "Sign Up", path: "/demo/signup" },
      ],
    },
  ],
  title: "デモ",
}
```

- テンプレートの「Data Table」（`/demo/tables/data-table`。#128）は無いので並べない。「Tooltips」は step3 で足す
- 「Sign In」は step5 で `/demo/signin` に変える（今のフォームはまだ `/signin` にある）

`AppSidebar.tsx`:

```tsx
const navSections: NavSection[] = [mainNavSection, demoNavSection]

const MENU_PATH_ALIASES: { menuPath: string, prefix: string }[] = [{ menuPath: "/", prefix: "/analytics/" }]

type SubmenuState = { itemIndex: number, sectionIndex: number } | null

const MENU_PATHS = navSections.flatMap((section) =>
  section.items.flatMap((nav) => [
    ...(nav.path ? [nav.path] : []),
    ...(nav.subItems?.map((subItem) => subItem.path) ?? []),
  ]),
)

const findSubmenuByPathname = (pathname: string): SubmenuState => {
  const activePath = findActiveMenuPath(pathname)
  for (const [sectionIndex, section] of navSections.entries()) {
    const itemIndex = section.items.findIndex((nav) => nav.subItems?.some((subItem) => subItem.path === activePath))
    if (itemIndex !== -1) return { itemIndex, sectionIndex }
  }
  return null
}

const buildSubmenuKey = (sectionIndex: number, itemIndex: number): string => `${sectionIndex}-${itemIndex}`
```

- `findActiveMenuPath`（前方一致で最も長いもの・`/` は完全一致・`MENU_PATH_ALIASES`）は今の式のまま、`MENU_PATHS` を全セクションから作る
- `renderMenuItems(items, sectionIndex)` にし、サブメニューの開閉・高さの記録（`subMenuHeight` / `subMenuRefs`）は `buildSubmenuKey` の文字列で持つ
- セクションごとに見出し（「メニュー」「デモ」）を描く。描き方は今の「Menu」の `<h2>` と同じ（折りたたみ時は `HorizontaLDots`）。テンプレートの `AppSidebar.tsx` が同じ形なので参考にする
- サブメニューの `pro` / `new` のバッジ（TailAdmin Pro の名残。どれも使っていない）と、型の `pro?` / `new?` を消す
- ファイルの冒頭の「TailAdmin テンプレートの画面はメニューに出さない」のコメントは消す

### 画像（`public/images/`）

| 対象 | 対応 |
| --- | --- |
| デモ（とヘッダーの固定のサンプル）だけが使う `user/` `country/` `brand/` `product/` `grid-image/` | `public/images/demo/` に移し、参照するパスを `/images/demo/...` に直す |
| どこからも参照されない `cards/` `carousel/` `chat/` `icons/` `task/` `video-thumb/` | 削除（約 4.7MB） |
| 参照されないファイル：`user/` の 15 枚（`user-07`〜`16`・`19`・`34`〜`37`）、`brand/` の `brand-09`〜`15`、`country/country-08.svg`、`error/` の 404 以外の 8 枚、`images/favicon.ico`（`app/favicon.ico` と同じ） | 削除 |
| `logo/` `shape/` `error/404*.svg` | 土台なので残す（ロゴは step2 で置き換える） |

ヘッダーの `UserDropdown` / `NotificationDropdown` の固定のサンプル画像も `/images/demo/user/...` に直す（中身は step6 で props にする）。`UserDropdown` の「Edit profile」「Account settings」「Support」の行き先（`/profile`）は `/demo/profile` にする。

### CSS

`app/globals.css` から、デモだけが使うブロックを `components/demo/demo.css` に移し、使われていないブロックを消す。

| ブロック | 対応 |
| --- | --- |
| Calendar（`modal-title` / `modal-footer` / `btn*` / `n-chk` / `form-check*` / `fc-event-*` / `.fc*` / `.custom-calendar` / `.form-check-input`）、DropZone（`dropzone` / `dz-message`）、地図（`mapOne` / `map-btn` / `.jvectormap-*`） | `demo.css` へ |
| swiper / carousel（`.stocks-slider-outer` / `.carouselTwo` などと `--shadow-slider-navigation`）、`.input-date-icon`、`.taskCheckbox` / `.task` | 削除（どこからも使われていない） |
| apexcharts（`.apexcharts-*`） | **残す**（ダッシュボードの `OverviewChart` が使う） |
| flatpickr（`.flatpickr-*`） | 残す（`ui/form/DatePicker` が使う） |
| `menu-*` / `dropdown-toggle` / `modal` / `max-h-select` / `no-scrollbar` / `custom-scrollbar` | 残す（土台が使う） |

```css
@reference "../../app/globals.css";

.modal-title {
  @apply font-semibold;
}
```

- **`@utility` のブロック（`modal-title` / `modal-footer` / `btn*` / `n-chk` / `form-check*` / `dropzone` / `dz-message` / `mapOne` / `map-btn` / `fc-event-*`）は、`.名前 { @apply ...; }` の素のクラスに書き換えて移す。** `@utility` のまま移すと、`@tailwind utilities` を持たない `demo.css` からは何も出力されず、デモの CSS が黙って消える。テンプレートの `components/demo/demo.css` が書き換えた後の形なので、差分を見ながら写す
- 素の CSS（`.fc*` / `.custom-calendar` / `.jvectormap-*`）はそのまま移す
- `app/layout.tsx` の `import "flatpickr/dist/flatpickr.css"` は消す（`DatePicker` が自分で読む）。デモの `StatisticsChart` に同じ import を足す

### 依存

| 依存 | 対応 |
| --- | --- |
| `react-dnd` / `react-dnd-html5-backend` / `swiper` / `@fullcalendar/list` / `@tailwindcss/forms` | `package.json` から消し、`pnpm install` する（どこからも import されていない） |
| `jsvectormap.d.ts` | 削除（宣言しているモジュールを誰も import していない） |
| `@fullcalendar/*` / `@react-jvectormap/*`（と `overrides`）/ `react-dropzone` | デモだけが使う。残す |
| `apexcharts` / `react-apexcharts` / `flatpickr` | 土台が使う。残す |

### 土台からデモを import させない lint

`eslint.config.mjs` に足す（`__dirname` はファイルの冒頭で既に作っている）。

```javascript
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/app/(dashboard)/demo/**", "src/app/(auth)/demo/**", "src/components/demo/**"],
    rules: {
      "import/no-restricted-paths": ["error", {
        basePath: __dirname,
        zones: [{
          except: ["./demo-nav-items.tsx"],
          from: "./src/components/demo",
          message: "土台からデモを import しない。デモの部品を使うなら props で動く形にして components/ui/ に移す",
          target: "./src",
        }],
      }],
    },
  },
```

- `settings.tailwindcss.cssFiles` に `"src/components/demo/*.css"` を足す（デモのクラス名が未定義と言われないように）
- 実装では、テンプレートの `eslint.config.mjs` と同じく、例外（`ignores` と `except`）と `basePath` の理由を設定の側に 1 か所だけ書く
- `frontend-boundary` の `no-restricted-imports` とは別のルールなので、設定が上書きし合わない

### そのほか

- `components/layout/PageBreadCrumb.tsx` の Alpine.js の名残（`x-text="pageName"`）を消す
- `.claude/skills/design-mock/SKILL.md`：参照先の `apps/admin/src/app/(dashboard)/ui/` を `apps/admin/src/app/(dashboard)/demo/ui/` に直す。`(dashboard)/page.tsx` は tech-english のダッシュボードなので、そのまま参考にしてよい
- `apps/admin/CLAUDE.md`（「API 接続の下地」の段落）：「テンプレートの画面はメニューに出さず、URL を直接開いて見る」「EC のダッシュボードの部品も参考として残している」を、次に書き換える
  - デモは `/demo/...`（`app/(dashboard)/demo/`・`app/(auth)/demo/`・`components/demo/`）に置き、サイドバーの「デモ」に並べる。design-mock の参考として残す
  - 新しい画面は土台（`app/(dashboard)/{feature}/`）に作り、サイドバーは `components/layout/nav-items.tsx` の `mainNavSection` に足す
  - 土台からデモを import しない（lint で強制）。デモだけの CSS は `components/demo/demo.css` に置き、`globals.css` に足さない
  - `/mock` はサイドバーに出さず、URL を直接開いて見る（今のまま）
- `apps/admin/README.md`：ディレクトリ構成に `components/demo/` と `app/(dashboard)/demo/` を足す。技術スタックの FullCalendar を「デモだけが使う」、ApexCharts を「ダッシュボードとデモが使う」と書き直す

## 動作確認

```bash
pnpm --filter admin lint
pnpm --filter admin build
```

- `build` が通ること（ページの移動漏れ・import のパスの誤りが無い）
- `lint` で `import/no-restricted-paths` の違反が無いこと。試しに `app/(dashboard)/page.tsx` から `components/demo/...` を import すると lint が落ちることを確かめる（確かめた後に戻す）
- `grep -rn "components/features/\(ecommerce\|example\|calendar\|user-profile\|videos\)\|components/ui/\(charts\|images\|ChartTab\)" apps/admin/src` が何も返さないこと

`verify-web-page` skill で画面を確かめる（port 3030。Basic 認証の資格情報は `pnpm exec dotenvx get ADMIN_BASIC_AUTH_PASSWORD -f .env.local`）。

| 確認 | 期待 |
| --- | --- |
| サイドバー | 「メニュー」にダッシュボード・問題・ソース・タグ・ユーザー、「デモ」に今までのデモの項目 |
| `/content-sources/new`・`/passages/1`・`/users/1`・`/analytics/passages/1` | それぞれ「ソース」「問題」「ユーザー」「ダッシュボード」が選択中（今と同じ） |
| `/demo/charts/bar` | 「デモ」の「Charts」が開き、「Bar Chart」が選択中 |
| デモの全ページ（`/demo/ecommerce`・`/demo/calendar`・`/demo/charts/*`・`/demo/forms/elements`・`/demo/tables/basic`・`/demo/ui/*`・`/demo/profile`・`/demo/blank`・`/demo/signup`） | 移す前と同じ見た目（画像の切れ・CSS の崩れが無い）。console にエラーが無い |
| 土台の全ページ（`/`・`/passages`・`/content-sources`・`/tags`・`/users`・`/mock`） | 移す前と同じ見た目。ダッシュボードのグラフ（ApexCharts）のツールチップと凡例の見た目が変わらない |
| 旧 URL（`/calendar`・`/ui/alerts` など） | 404 |
| ダークモード | デモの全ページが移す前と同じ |

PR には、移す前と後の `/demo/ecommerce`（移す前は無いので後だけ）・`/demo/calendar`（デモの CSS を使う代表）・サイドバーのスクリーンショットを付ける。
