# step3-admin-tooltip

マウスを乗せる・フォーカスすると説明の吹き出しを出す `Tooltip` を `components/ui/tooltip/` に作る。見た目と動きは TailAdmin のデモ（https://demo.tailadmin.com/tooltips ）と同じにする。デモに見本の画面（`/demo/ui/tooltips`）を足し、土台の画面で今 `title` 属性で出している説明を Tooltip にする。

設計: [Tooltip の作り](../README.md#tooltip-の作り) / [仕様: Tooltip](../README.md#tooltip)

## 前提

- [step1](./step1-admin-demo-isolation.md) の後（見本をデモの置き場所に置く）。step2 とは独立
- この step のパスは、特に書かない限り `apps/admin/src/` からの相対

## 対応内容

### 変更するファイル

```
apps/admin/
├── package.json                                      # @floating-ui/react を足す
├── src/components/ui/tooltip/Tooltip.tsx             # 新設
├── src/components/demo/example/TooltipExample.tsx    # 新設 見本
├── src/app/(dashboard)/demo/ui/tooltips/page.tsx     # 新設
├── src/components/demo/demo-nav-items.tsx            # UI Elements に Tooltips を足す
├── src/components/features/passage/PassageReview.tsx # 再生成・要確認を解除・取得元
├── src/components/features/passage/PassagePreview.tsx # 用語集の語句
└── src/components/features/user/UserTable.tsx        # 列見出し「ログイン方法」
```

### 依存

```bash
pnpm --filter admin add @floating-ui/react@^0.27.20
```

### `Tooltip`

テンプレートの `apps/admin/src/components/ui/tooltip/Tooltip.tsx` を写す。違いは吹き出しの幅だけ。

| | テンプレート | tech-english |
| --- | --- | --- |
| 吹き出しの共通のクラス | `z-99999 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-medium shadow-md` | `z-99999 w-max max-w-xs rounded-lg px-3.5 py-2 text-xs font-medium shadow-md` |

- 長い説明（「要確認を解除」の説明・取得元のパス）を 320px で折り返すため。短い説明は `w-max` で中身の幅のままなので、デモと同じ見た目になる
- 取得元のパスは空白の無い長い文字列なので、吹き出しの中身に `break-all` を付けて渡す（Tooltip の側では付けない）

テンプレートの作りのまま写すもの（確かめる点）:

```typescript
type TooltipProps = {
  children: React.ReactElement<Record<string, unknown>>
  content: React.ReactNode
  placement?: "top" | "right" | "bottom" | "left"
  variant?: "default" | "dark" | "plain" | "no-arrow"
}
```

- `useFloating({ middleware: [offset(10), flip({ fallbackAxisSideDirection: "start" }), shift({ padding: 8 }), arrow({ element: arrowElement, padding: 8 })], onOpenChange: setIsOpen, open: isOpen, placement, whileElementsMounted: autoUpdate })`。`isOpen` が false の間は吹き出しを描かない
- 矢印の要素は ref ではなく state（`setArrowElement`）で持つ（描画中に ref を読まない。React Compiler の規則）
- `useInteractions([useHover(context), useFocus(context), useDismiss(context), useRole(context, { role: "tooltip" })])`
- トリガーに呼び出し側の ref があれば `useMergeRefs` でまとめる（上書きして消さない）
- 吹き出しは `FloatingPortal` の中に描く。矢印の辺と位置は、flip の後の実際の placement で決める
- 4 種類の色・矢印の辺と位置の対応表（`BUBBLE_VARIANT_CLASSES` / `ARROW_COLOR_CLASSES` / `ARROW_SIDE_CLASSES` / `ARROW_OUTER_SIDE`）はテンプレートのまま。値の根拠（デモの実測）はテンプレートの spec の step3 にある
- `export default`（`components/ui/` のほかの部品と同じ）

### 見本の画面（`/demo/ui/tooltips`）

- `components/demo/example/TooltipExample.tsx` と `app/(dashboard)/demo/ui/tooltips/page.tsx` はテンプレートの同じファイルを写す。デモの Tooltips の画面と同じ構成（Default・White・Dark・Without Arrow・Placement）
- `metadata.title` は `"Tooltips"`
- `components/demo/demo-nav-items.tsx` の「UI Elements」の「Images」と「Videos」の間に `{ name: "Tooltips", path: "/demo/ui/tooltips" }` を足す

### 土台の画面の `title` を Tooltip にする

`grep -rn 'title=' apps/admin/src/components apps/admin/src/app` で、要素の `title` 属性（部品の `title` の props は除く）を洗い出した結果:

| ファイル | 要素 | 対応 |
| --- | --- | --- |
| `components/features/passage/PassageReview.tsx` | 「再生成」のボタン（`title` は挑戦があるときだけ） | 挑戦があるときは、ボタンを `tabIndex={0}` の `span` で包み、`span` に Tooltip を付ける。挑戦が無いときは今のボタンのまま |
| 同上 | 「要確認を解除」のボタン | ボタンに Tooltip を付ける（フォーカスできる要素なので包まない） |
| 同上 | 取得元の `dd`（`truncate`） | `dd` に `tabIndex={0}` を付けて Tooltip を付ける。中身は `<span className="break-all">{detail.source.path}</span>` |
| `components/features/passage/PassagePreview.tsx` | 用語集の語句の `span` | 語句（`entry` がある run）だけ、`span` に `tabIndex={0}` を付けて Tooltip を付ける。語句でない run は今のまま |
| `components/features/user/UserTable.tsx` | 列見出し「ログイン方法」（今は `title` も無い） | 見出しの文字と情報のアイコンを `tabIndex={0}` の `span` で包み、Tooltip を付ける |
| `components/features/user/UserCalendar.tsx` | 学習カレンダーのマス | **対象外**。今の `title` のまま（[README](../README.md#tooltip-の作り)） |
| `components/ui/video/YouTubeEmbed.tsx` | `iframe` の `title` | 対象外（吹き出しではなく、iframe の名前） |

`/mock` の下の `title` は対象外。

「再生成」:

```tsx
const regenerateButton = (
  <button
    className={`${outlineButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
    disabled={isPending || !canRegenerate}
    type="button"
    onClick={() => setIsRegenerateOpen(true)}
  >
    再生成
  </button>
)

{(isDraft || detail.status === "failed" || isRejected) && (
  detail.attempt_count > 0
    ? (
      <Tooltip content="挑戦がある問題は再生成できません">
        <span className="inline-flex" tabIndex={0}>{regenerateButton}</span>
      </Tooltip>
    )
    : regenerateButton
)}
```

- 押せないボタンにはマウスのイベントが届かないので、外側の `span` で受ける。`span` は Tab で止まるので、キーボードでも説明が出る
- 今の `title={... ? "..." : undefined}` は消す

「要確認を解除」:

```tsx
<Tooltip content="理由を確かめた・直した後に押すと、要確認の印と理由が消え、一覧の要確認の先頭から外れます">
  <button
    className={`${outlineButtonClass} shrink-0`}
    disabled={isPending}
    type="button"
    onClick={() => runInTransition({ form, isDirty, type: "resolveAttention" })}
  >
    要確認を解除
  </button>
</Tooltip>
```

取得元:

```tsx
<Tooltip content={<span className="break-all">{detail.source.path}</span>}>
  <dd className="mt-0.5 truncate font-mono text-theme-xs text-gray-800 dark:text-white/90" tabIndex={0}>
    {detail.source.path}
    {detail.source.commit_sha && <span className="ml-2 text-gray-400">@{detail.source.commit_sha.slice(0, 7)}</span>}
  </dd>
</Tooltip>
```

用語集の語句（`buildRuns(...).map` の中）:

```tsx
const runClassName = `${run.isHighlight ? "bg-[#f3b24c]/25" : ""} ${
  entry ? `underline decoration-2 underline-offset-4 ${isTarget ? "decoration-[#90c6f0] decoration-dashed" : "decoration-[#f3b24c]/80 decoration-dotted"}` : ""
}`
if (!entry) {
  return <span key={index} className={runClassName}>{run.text}</span>
}
return (
  <Tooltip key={index} content={`${entry.lemma}：${entry.meaning_ja}${isTarget ? "（語義設問の対象。解答中は非表示）" : ""}`}>
    <span className={runClassName} tabIndex={0}>{run.text}</span>
  </Tooltip>
)
```

ユーザー一覧の列見出し:

```tsx
<th className={tableHeadCellClass}>
  <Tooltip content="ユーザーが紐付けているログイン方法（GitHub・Google・dev）">
    <span className="inline-flex items-center gap-1" tabIndex={0}>
      ログイン方法
      <InfoIcon className="size-4" viewBox="0 0 24 24" />
    </span>
  </Tooltip>
</th>
```

- SVGR が `viewBox` を消すので、小さく描くときは `viewBox` を渡す（テンプレートの `UserTable` と同じ。理由は実装の側に 1 か所だけ書く）
- `UserTable` が Server Component でも、client component の `Tooltip` をそのまま置ける

### ドキュメント

`apps/admin/CLAUDE.md` の「API 接続の下地」の表に `src/components/ui/tooltip/Tooltip.tsx` の行を足す（説明を出すときは `title` 属性ではなく Tooltip を使う。押せないボタンは `tabIndex={0}` の `span` で包む）。

## 動作確認

```bash
pnpm --filter admin lint
pnpm --filter admin build
```

`verify-web-page` skill で、デモ（https://demo.tailadmin.com/tooltips ）と並べて確かめる。

| 確認 | 期待 |
| --- | --- |
| `/demo/ui/tooltips` の 4 種類 × 上下左右 | 吹き出しの背景・文字・枠・影・角丸・余白・矢印の色と位置が、デモと `getComputedStyle` で同じ（ライト / ダーク。ダークは `localStorage.theme = "dark"` で再読み込み） |
| トリガーとの間 | 10px で中央に合っている（`getBoundingClientRect` で測る） |
| 画面の上端のボタンで `placement="top"` | 下に反転し、矢印の辺も変わる |
| キーボード | Tab でフォーカスしても出て、Esc で消える。トリガーに `aria-describedby` が付いている |
| 挑戦がある問題（下書き・失敗・却下）の「再生成」 | 押せないボタンにマウスを乗せると「挑戦がある問題は再生成できません」。Tab でも出る |
| 「要確認を解除」 | 説明が 320px で折り返して出る |
| 長い取得元のパス | パスの全体が折り返して出る |
| プレビューの用語集の語句 | `見出し語：意味` が出る。語義設問の対象は「（語義設問の対象。解答中は非表示）」が付く |
| ユーザー一覧の「ログイン方法」 | 説明が出て、表の枠（`overflow-x-auto`）の外にはみ出しても切れない |
| ユーザーの詳細の学習カレンダー | 今と同じ（標準の吹き出し） |

PR には、デモの 4 種類 × ライト / ダークのスクリーンショット（デモと並べて）と、土台の 5 か所の Tooltip のスクリーンショットを付ける。
