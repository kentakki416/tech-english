# step5-web-vocabulary

web の単語帳を作る。単語帳のトップ（`/vocabulary`）と 1 回分の画面（`/vocabulary/session`：カードをめくって答え、最後にふりかえり）、共通ヘッダーのナビの「単語帳」、結果画面の「単語帳で復習する」。

## 前提

- [step2-api-vocabulary-session](./step2-api-vocabulary-session.md)・[step3-api-vocabulary-review](./step3-api-vocabulary-review.md)（API とスキーマ）
- **`design-mock` skill で web のモック（`/mock/vocabulary`・`/mock/vocabulary/session`）を作り、README に「UI 設計」を足してから始める**。見た目（大きさ・余白・配色・めくる動き）は UI 設計に従い、この step は画面の構成と振る舞いを書く
- web の規約：[apps/web/CLAUDE.md](../../../../apps/web/CLAUDE.md)（取得は Server Component、書き込みは Server Action、`features/*.api.ts` は `server-only`、型は `@repo/api-schema` から）
- 仕様は README の [カードの表と裏](../README.md#カードの表と裏)・[1 回の流れ](../README.md#1-回の流れ)・[単語帳のトップ](../README.md#単語帳のトップ)・[web の実装構成](../README.md#web-の実装構成)

## 対応内容

### 1. API の通信層

`src/features/vocabulary/vocabulary.api.ts` を新設する（既存の `learning-record.api.ts` と同じ形）。

```typescript
/** apps/web/src/features/vocabulary/vocabulary.api.ts */
import "server-only"

import {
  type GetVocabularySessionResponse,
  getVocabularySessionResponseSchema,
  type GetVocabularySummaryResponse,
  getVocabularySummaryResponseSchema,
  type ReviewVocabularyCardRequest,
  type ReviewVocabularyCardResponse,
  reviewVocabularyCardResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 単語帳の API 通信層
 */
export const vocabularyApi = {
  /**
   * GET /api/vocabulary/session。1 回分のカード（最大 10 枚）
   */
  getSession: async (): Promise<GetVocabularySessionResponse> => {
    const raw = await apiClient.get<unknown>("/api/vocabulary/session")
    return getVocabularySessionResponseSchema.parse(raw)
  },
  /**
   * GET /api/vocabulary/summary。単語帳のトップの数
   */
  getSummary: async (): Promise<GetVocabularySummaryResponse> => {
    const raw = await apiClient.get<unknown>("/api/vocabulary/summary")
    return getVocabularySummaryResponseSchema.parse(raw)
  },
  /**
   * POST /api/vocabulary/review。client_review_id で冪等なので、失敗したら同じ値で送り直してよい
   */
  review: async (input: ReviewVocabularyCardRequest): Promise<ReviewVocabularyCardResponse> => {
    const raw = await apiClient.post<unknown>("/api/vocabulary/review", input)
    return reviewVocabularyCardResponseSchema.parse(raw)
  },
}
```

### 2. 単語帳のトップ（`/vocabulary`）

`src/app/vocabulary/page.tsx`。Server Component で summary を取り、共通ヘッダーの下に出す。

```tsx
/** apps/web/src/app/vocabulary/page.tsx */
export const metadata: Metadata = {
  title: "単語帳",
}

/**
 * 単語帳のトップ。今日の分（今日の復習・新しい単語）と単語の数、今日の分が無ければ次の復習の日
 */
export default async function VocabularyPage() {
  const summary = await vocabularyApi.getSummary().catch(redirectIfSessionRejected)

  return (
    <>
      <AppHeader current="vocabulary" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold text-fg">単語帳</h1>
        <VocabularySummaryPanel summary={summary} />
      </main>
    </>
  )
}
```

`src/components/features/vocabulary/VocabularySummaryPanel.tsx`（Server Component でよい。操作は「はじめる」の `Link` だけ）:

| 状態 | 出すもの |
| --- | --- |
| 今日の分がある（`due_count + new_count > 0`） | 今日の復習の枚数・新しい単語の数、「はじめる」（主要ボタン。`/vocabulary/session` への `Link`）、復習中・覚えた単語の数 |
| 今日の分が無く、カードがある | 「今日の分は終わりました」と `next_due_date`（`formatDayLabel`）、復習中・覚えた単語の数 |
| 候補もカードも無い | 「問題を解くと、読んだ本文の単語と調べた単語がここに並びます。」と問題一覧（`/passages`）への導線 |

- 1 回の枚数は `Math.min(due_count + new_count, 10)` を「はじめる（10 枚）」のように添える。10 は `@repo/domain` を import できないので、セッションの API の上限に合わせた定数を `src/features/vocabulary/` に置く（API が返す枚数が正なので、表示の目安としてだけ使う）

### 3. 共通ヘッダーと結果画面

- `src/components/ui/AppHeader.tsx` の `NavKey` に `"vocabulary"` を足し、`NAV_ITEMS` の「問題」と「履歴」の間に `{ href: "/vocabulary", key: "vocabulary", label: "単語帳" }` を入れる。スマホ幅でナビが 5 つ並ぶので、390px 幅で折り返さないことを Playwright で確かめる
- `src/components/features/attempt/ResultScreen.tsx` の「調べた単語」の見出しの行に、調べた単語が 1 つ以上あるときだけ「単語帳で復習する」（`/vocabulary` への `Link`。`LINK_CLASS`）を出す

### 4. 1 回分の画面（`/vocabulary/session`）

#### ページと Server Action

```tsx
/** apps/web/src/app/vocabulary/session/page.tsx */
export const metadata: Metadata = {
  title: "単語帳",
}

/**
 * 1 回分のカード。カードが無ければ「今日の分は終わりました」を出す（次の復習の日を出すため summary も取る）。
 * renderId で、「もう 1 回」の router.refresh() のたびに VocabularySession を作り直す（前の回の state を持ち越さない）
 */
export default async function VocabularySessionPage() {
  const session = await vocabularyApi.getSession().catch(redirectIfSessionRejected)
  const summary = session.cards.length === 0 ? await vocabularyApi.getSummary().catch(redirectIfSessionRejected) : null

  return (
    <VocabularySession
      key={crypto.randomUUID()}
      cards={session.cards}
      nextDueDate={summary?.next_due_date ?? null}
      reviewAction={reviewVocabularyCardAction}
    />
  )
}
```

```typescript
/** apps/web/src/app/vocabulary/session/actions.ts */
"use server"

import { type ReviewVocabularyCardRequest, reviewVocabularyCardRequestSchema } from "@repo/api-schema"

import { vocabularyApi } from "@/features/vocabulary/vocabulary.api"

/**
 * 保存できたかだけを返す。saved のときは答えた後の段階と次に出す日
 */
export type ReviewVocabularyCardActionResult =
  | { dueDate: string | null; stage: number; status: "saved" }
  | { status: "failed" }

/**
 * 1 枚の答えを保存する。revalidatePath は呼ばない（1 枚ごとに 1 回分の画面を描き直さないため。
 * トップとマイページは cookie を読む動的な画面なので、開き直せば新しい数になる）
 */
export const reviewVocabularyCardAction = async (input: ReviewVocabularyCardRequest): Promise<ReviewVocabularyCardActionResult> => {
  const parsed = reviewVocabularyCardRequestSchema.safeParse(input)
  if (!parsed.success) return { status: "failed" }
  try {
    const card = await vocabularyApi.review(parsed.data)
    return { dueDate: card.due_date, stage: card.stage, status: "saved" }
  } catch {
    return { status: "failed" }
  }
}
```

- 1 回分の画面は解答画面と同じく共通ヘッダーを出さず、専用の上部バー（「‹ 単語帳」・進み具合）を持つ

#### `VocabularySession`（Client Component）

`src/components/features/vocabulary/VocabularySession.tsx`。今のカード・めくったか・答えの一覧を state に持つ。

```tsx
/** apps/web/src/components/features/vocabulary/VocabularySession.tsx */
"use client"

type VocabularyCard = GetVocabularySessionResponse["cards"][number]

/**
 * 1 枚の答え。clientReviewId は送り直しでも同じ値を使う（API が冪等）
 */
type CardAnswer = {
  activeSeconds: number
  clientReviewId: string
  grade: VocabularyGrade
  lemma: string
  saveStatus: "failed" | "saved" | "saving"
}

export function VocabularySession({ cards, nextDueDate, reviewAction }: VocabularySessionProps) {
  const [answers, setAnswers] = useState<CardAnswer[]>([])
  const [isFlipped, setIsFlipped] = useState(false)
  const [, startSaving] = useTransition()
  const current = cards[answers.length]

  const save = (answer: CardAnswer) => {
    startSaving(async () => {
      const result = await reviewAction({
        active_seconds: answer.activeSeconds,
        client_review_id: answer.clientReviewId,
        grade: answer.grade,
        lemma: answer.lemma,
      })
      startSaving(() => {
        setAnswers((previous) => previous.map((item) =>
          item.clientReviewId === answer.clientReviewId ? { ...item, saveStatus: result.status } : item))
      })
    })
  }

  /**
   * 答えたら保存を待たずに次のカードへ進む（保存の失敗はふりかえりで送り直せる）
   */
  const answer = (grade: VocabularyGrade, activeSeconds: number) => {
    if (!current || !isFlipped) return
    const next: CardAnswer = { activeSeconds, clientReviewId: crypto.randomUUID(), grade, lemma: current.lemma, saveStatus: "saving" }
    setAnswers((previous) => [...previous, next])
    setIsFlipped(false)
    save(next)
  }
  /** …（current が無ければ <SessionReview />、あれば上部バー・進み具合・<FlashCard key={current.lemma} />） */
}
```

- `VocabularyGrade` は `ReviewVocabularyCardRequest["grade"]` から作る（`@repo/domain` は import できない）
- 進み具合は `answers.length + 1 / cards.length` とマス（答えたマスは「覚えた」が琥珀、「まだ」がローズ）。既存の `ScoreSquares` が使えるか UI 設計で決める
- カードが 0 枚で始まったときは、ふりかえりではなく「今日の分は終わりました」と `nextDueDate`、トップへの導線を出す
- 途中で離れても確認は出さない（答えた分は保存済みで、答えていないカードは何も変わらないため）

#### `FlashCard`

`src/components/features/vocabulary/FlashCard.tsx`。1 枚のカード。`key={current.lemma}` で 1 枚ごとに作り直し、見ていた秒数をカードごとに 0 から測る。

- **見ていた秒数**：解答画面の `use-active-seconds.ts` を `src/libs/use-active-seconds.ts` に移して両方から使い、`useActiveSeconds({ initialSeconds: 0, isRunning: true })` で測る。答えるときに `onAnswer(grade, seconds)` で親に渡す（上限の 60 秒はサーバーで切り詰める）
- **表**：語句（見出し語が違えば小さく添える）・品詞・本文の 1 文（単語を強調）・「{問題のタイトル} より」・新しい単語なら「新しい単語」。「めくる」ボタン
- **裏**：表の語句と 1 文を残し、意味（`splitDictionarySenses` で辞書の意味を区切る）・補足・出どころ（用語集は琥珀の点と「この文での意味」、辞書は灰の点と「英和辞書（一般的な意味）」）、「まだ」「覚えた」
- **めくる動き**：表と裏を重ね、親に `perspective`、カードに `transform-style: preserve-3d` と `rotateY(180deg)` の `transition`（400ms）。裏は `backface-visibility: hidden` と `rotateY(180deg)`。`motion-reduce:` のときは `transition` を外して切り替えだけにする
- **めくる前は答えのボタンを出さない**。めくった後にもう一度めくると表に戻る（答える前だけ）
- 表を見ている間は、裏の意味を読み上げ（スクリーンリーダー）にも出さない（`aria-hidden`）。めくったら「意味」を `aria-live="polite"` で伝える

本文の 1 文の描画（`src/components/features/vocabulary/SentenceText.tsx`）：

```tsx
/**
 * 本文の 1 文。highlight_start〜highlight_end を強調し、インラインコードは本文と同じ見た目で描く
 */
export function SentenceText({ sentence }: { sentence: NonNullable<VocabularyCard["sentence"]> }) {
  const parts = [
    { isHighlight: false, text: sentence.text.slice(0, sentence.highlight_start) },
    { isHighlight: true, text: sentence.text.slice(sentence.highlight_start, sentence.highlight_end) },
    { isHighlight: false, text: sentence.text.slice(sentence.highlight_end) },
  ]
  return (
    <p className="font-reading">
      {parts.map((part, index) => {
        const content = splitInlineCode(part.text).map((piece, pieceIndex) =>
          piece.isCode ? <InlineCode key={pieceIndex}>{piece.text}</InlineCode> : <Fragment key={pieceIndex}>{piece.text}</Fragment>)
        return part.isHighlight ? <mark key={index} className="…">{content}</mark> : <Fragment key={index}>{content}</Fragment>
      })}
    </p>
  )
}
```

- `InlineCode` は `PassageReader.tsx` の中にしか無いので、`src/components/features/passage/InlineCode.tsx` に切り出して `PassageReader` と共有する。`splitInlineCode` は `passage-text.ts` の既存の関数
- 用語集の語句はインラインコードをまたがない（解答中もインラインコードは押せない）ので、強調の境目でコードが割れることは無い

#### キーボード

`src/components/features/vocabulary/use-vocabulary-shortcuts.ts`。解答画面の `use-attempt-shortcuts.ts` と同じく `useEffectEvent` で 1 回だけ登録し、入力欄・IME の変換中・修飾キーつきは無視する。

| キー | 動作 |
| --- | --- |
| `Space` / `Enter` | めくる（めくった後なら表に戻す） |
| `→` | 覚えた（めくった後だけ） |
| `←` | まだ（めくった後だけ） |

- `Space` はページのスクロールを止める（`preventDefault`）
- ボタンにキーの表示（`Keycap`）を添える

#### ふりかえり

`src/components/features/vocabulary/SessionReview.tsx`。全部答えたら出す。

- 「覚えた 7 / まだ 3」
- 「まだ」の単語の一覧（語句と意味）
- 保存に失敗したカードがあれば「保存できなかったカードがあります」と「もう一度送る」（同じ `clientReviewId` で `save` を呼び直す）
- 「もう 1 回」（`router.refresh()`。次の回のカードが無ければページが「今日の分は終わりました」を出す）と「単語帳のトップへ」（`/vocabulary`）
- 保存中のカードが残っている間は「もう 1 回」を押せない（取り直した回に、保存前のカードがもう一度入らないように）

## 動作確認

```bash
pnpm --filter web lint
pnpm build
```

web にはテストランナーが無いので、Playwright MCP で実画面を確かめる（[apps/web/CLAUDE.md の動作確認](../../../../apps/web/CLAUDE.md)。認証は `verify-web-page` skill の手順で cookie を入れる）。前もって問題を 1 つ提出し、単語を 2〜3 個調べておく。

- [ ] `/vocabulary` に着地し（`/sign-in` に飛ばされていない）、今日の復習・新しい単語の数が API と一致する。コンソールのエラーが 0 件
- [ ] 「はじめる」で `/vocabulary/session` が開き、調べた単語のカードが先に出る。表には意味が出ていない
- [ ] 「めくる」と `Space` でめくれ、裏に意味・出どころが出る。めくる前は答えのボタンが無く、`→` / `←` を押しても何も起きない
- [ ] `→` で次のカードへ進み、`vocabulary_reviews` に 1 行増える（DB で確かめる）。`active_seconds` が表示していた秒数に近い
- [ ] 全部答えるとふりかえりが出て、「覚えた / まだ」の数と「まだ」の単語が合っている
- [ ] 「単語帳のトップへ」で戻ると、新しい単語の数が答えた分だけ減っている
- [ ] 「もう 1 回」で次の回が始まり、前の回の答えの state が残っていない
- [ ] API を止めて答えると、ふりかえりに「保存できなかったカードがあります」が出て、API を戻して「もう一度送る」と保存される（答えは 1 行だけ）
- [ ] 候補が無いユーザー（新しく dev-login したユーザー）でトップが案内と問題一覧への導線を出す
- [ ] 共通ヘッダーに「単語帳」が出て、`/vocabulary` で琥珀の下線が付く。390px 幅でナビが折り返さない
- [ ] 結果画面の「調べた単語」に「単語帳で復習する」が出て（調べた単語が 0 のときは出ない）、押すとトップへ行く
- [ ] OS の「視差効果を減らす」を有効にすると、めくる動きが切り替えだけになる（`emulate_media` の `reducedMotion: reduce`）
- [ ] 1440px と 390px でカードが崩れない

PR には before/after のスクリーンショットを入れる（[apps/web/CLAUDE.md](../../../../apps/web/CLAUDE.md)）。共通ヘッダーと結果画面は before / after、単語帳の 2 画面は after だけ（新規ページ）。
