# step3-admin-dashboard

admin のトップ（`/`）をダッシュボードにし、問題の分析（`/analytics/passages/[id]`）を足す。サイドバーに「ダッシュボード」を足し、左上のロゴのリンク先を `/` に戻す。

## 前提

- [step2-api-admin-stats](./step2-api-admin-stats.md)
- 見た目は README の [UI 設計](../README.md#ui-設計) とモック（`apps/admin/src/app/(dashboard)/mock/dashboard/`・`mock/analytics/`）に従う。モックの部品（`PeriodTabs`・`TableParts`・`stats-format`・`OverviewCards`・`OverviewChart`・`AssistCard`・`PassageStatsTable`・`QuestionStatsCard`）は本実装の `components/features/stats/`・`src/libs/format-stats.ts` に移して使う（`mock/` は import しない）
- admin の画面の作り方は `apps/admin/CLAUDE.md` の「API 接続の下地」（Server Component から `features/*.api.ts` → `apiClient`、レスポンスは `@repo/api-schema` で parse）

## 対応内容

### 1. API の呼び出し

`src/features/stats/stats.api.ts`（先頭に `import "server-only"`）。`passage.api.ts` と同じ形。

```typescript
/** apps/admin/src/features/stats/stats.api.ts */
import "server-only"

import {
  type AdminPassageStatsSort,
  type AdminStatsPeriod,
  getAdminPassageStatsListResponseSchema,
  getAdminPassageStatsResponseSchema,
  getAdminStatsOverviewResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const statsApi = {
  getOverview: async (period: AdminStatsPeriod) =>
    getAdminStatsOverviewResponseSchema.parse(await apiClient.get(`/api/admin/stats/overview?period=${period}`)),
  getPassageList: async (query: { order: "asc" | "desc"; page: number; period: AdminStatsPeriod; q?: string; sort: AdminPassageStatsSort }) => { /** URLSearchParams で組み立てる */ },
  /**
   * 問題が無ければ null（404）
   */
  getPassage: async (id: number, period: AdminStatsPeriod) => { /** ApiClientError の status 404 を null にする */ },
}
```

- `AdminStatsPeriod`・`AdminPassageStatsSort` の型は `@repo/api-schema` から import する（step2 で export したもの）

### 2. 期間・並べ替えの読み取り

`src/features/stats/stats.params.ts`（純関数）。`searchParams` を検証し、不正・未指定は既定値（`30d`・`solved_users`・`desc`・1 ページ目）にする。`adminPassageStatusSchema.safeParse` で状態を読む問題一覧と同じ考え方。リンクを作る関数（期間を保ったまま並べ替え・ページを変える）も同じファイルに置く。

### 3. ダッシュボード（`/`）

- `app/(dashboard)/page.tsx` を置き換える（TailAdmin の EC のダッシュボード。`components/features/ecommerce/` は消さない）。`await connection()` で動的にし、`overview` と `passage` の一覧を `Promise.all` で取る
- `components/features/stats/`：
  - `PeriodTabs.tsx`：期間の切り替え（リンク。`?period=` を変え、並べ替えは保つ）
  - `OverviewCards.tsx`：数字のカード 4 枚（登録ユーザー・学習したユーザー・解いた回数・正答率）
  - `AssistCard.tsx`：アシストの利用率の横棒（和訳・単語・読み上げ）。推移の横に置く
  - `OverviewChart.tsx`（`"use client"`）：推移のグラフ。`react-apexcharts` を `next/dynamic`（`ssr: false`）で読む。テンプレートの `MonthlySalesChart` と同じ読み方
  - `PassageStatsTable.tsx`：問題ごとの成績の表。列の見出しが並べ替えのリンク、タイトルの絞り込み（`?q=`。GET の form）、ページ送り。行は `/analytics/passages/[id]?period=…` へのリンク
  - 表示の整形（比率 → `72%`、秒 → `4:12`、`null` → `―`）は `src/libs/format-stats.ts` の純関数にする
- `metadata.title` は「ダッシュボード | tech-english admin」

### 4. 問題の分析（`/analytics/passages/[id]`）

- `app/(dashboard)/analytics/passages/[id]/page.tsx`。問題が無ければ `notFound()`
- 上部：タイトル・状態・ソース・公開日と、問題ごとの成績と同じ数字。「確認・修正を開く」は `/passages/[id]` へ
- 設問ごと（`components/features/stats/QuestionStatsCard.tsx`）：種類・設問文・正答率・選択肢ごとの割合の横棒（正解に印）・未回答の割合・「要確認」の印
- 注意書き（非公開に戻して直した問題は、直す前の解答も同じ位置の選択肢として数える）を設問の上に出す
- パンくずは「Home > 問題の分析」（Home は `/` のダッシュボード）。上に同じ期間のダッシュボードへの「← ダッシュボードに戻る」

### 5. サイドバーとロゴ

- `src/components/layout/AppSidebar.tsx` の `navItems` の先頭に `{ icon: <GridIcon />, name: "ダッシュボード", path: "/" }` を足す
- 今の `findActiveMenuPath` は `${path}/` の前方一致なので、`/` は完全一致にしか当たらない。`/analytics/*` を開いたときも「ダッシュボード」を選択中にするよう、`/analytics` を `/` に対応させる規則を足す
- 左上のロゴのリンク先（`src/components/layout/AppLogo.tsx` の `HOME_PATH`）を `/passages` から `/` に変える
- `apps/admin/CLAUDE.md` の「接続済みの画面」の表にダッシュボードと問題の分析を足す。同じファイルと `AppSidebar.tsx` の `navItems` のコメントで「テンプレートの画面」の例に挙げている `/` を外す（`/` はダッシュボードになるため）

## 動作確認

```bash
pnpm --filter @repo/api-schema build
cd apps/admin && pnpm build && pnpm lint:fix
```

`apps/admin/CLAUDE.md` の「動作確認（必須）」のとおり Playwright MCP で確かめ、before / after のスクショ（`docs/screenshots/admin-dashboard/`）を PR に載せる。dev の DB に挑戦が無ければ、web で問題を何回か解いてから見る。

- [ ] `/` で数字のカード・推移のグラフ・問題ごとの成績が出て、console のエラーが 0 件
- [ ] 期間を 7 日・30 日・全期間に切り替えると URL と数字が変わり、全期間のグラフが週ごとになる
- [ ] 表の見出しで並べ替えが変わり、期間を変えても並べ替えが保たれる。タイトルで絞り込める。ページ送りができる
- [ ] 表の行から問題の分析を開くと、同じ期間で設問ごとの割合が出る。「確認・修正を開く」で `/passages/[id]` に移る
- [ ] 存在しない問題の分析は 404 の画面になる
- [ ] サイドバーの「ダッシュボード」が `/` と `/analytics/*` で選択中になり、「問題」は `/passages/*` だけで選択中になる
- [ ] スマホ幅（390px）で表が横にスクロールでき、カードが縦に並ぶ
