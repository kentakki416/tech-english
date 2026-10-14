# step3-api-vocabulary-pronunciation

`GET /api/vocabulary/session` のカードに `pronunciation` を足す。単語の発音は `word_audios` の `ready` の mp3 の URL、1 文はカードの元の問題の読み上げのマニフェストから区間を求める。新しいエンドポイントは作らない。

## 前提

- [step1-db-word-audios](./step1-db-word-audios.md)、[step2-cron-generate-word-audio](./step2-cron-generate-word-audio.md)（`word_audios` に `ready` の行ができる）
- vocabulary-cards の [step2-api-vocabulary-session](../../vocabulary-cards/tasks/step2-api-vocabulary-session.md)（`getVocabularySession`・`buildVocabularyCard`・`extractSentence`）
- read-aloud の [step4-api-attempt-audio](../../read-aloud/tasks/step4-api-attempt-audio.md)（`src/lib/passage-audio.ts` の `resolveAudioStatus`・`buildAudioUrl`、`audioPublicUrlBase` の DI、`PassageAudioRepository`）
- 仕様は README の [音声ができるまで](../README.md#音声ができるまで)・[1 文の区間の求め方](../README.md#1-文の区間の求め方)・[単語の音声の保存と配信](../README.md#単語の音声の保存と配信)

## 対応内容

### 1. API スキーマ

`packages/schema/src/api-schema/vocabulary.ts` のカードに `pronunciation` を足す（キーはアルファベット順で `passage` の後）。

```typescript
      /**
       * 発音の音声（vocabulary-pronunciation）。word_url は見出し語の mp3（まだ作っていなければ null）。
       * sentence は元の問題の読み上げの音声の、カードの 1 文の区間（音声ができていない・区間が求まらなければ null）
       */
      pronunciation: z.object({
        sentence: z.object({ end_ms: z.number().int().min(0), start_ms: z.number().int().min(0), url: z.string().url() }).nullable(),
        word_url: z.string().url().nullable(),
      }),
```

`pnpm --filter @repo/api-schema build` で web / mobile に型を渡す。

### 2. 1 文の位置を残す

- `src/lib/extract-sentence.ts` の `ExtractedSentence` に `blockEndOffset` / `blockStartOffset`（カードに出す範囲〈`…` を除く〉の、ブロックの本文上の位置）を足す。レスポンスには出さない（Controller が `text`・`highlight_*` だけを返す）
- `src/lib/build-vocabulary-card.ts` の `VocabularyCardView` に `sentenceBlockIndex: number | null` を足す。用語集は `glossary.blockIndex`、辞書は `findSentenceBySurface` で見つけたブロックの index

### 3. 1 文の区間

`src/lib/build-sentence-clip.ts`（純関数）。

```typescript
/** apps/api/src/lib/build-sentence-clip.ts */
import type { PassageAudioManifest } from "@repo/domain"

/**
 * 1 文の区間（パートの mp3 のキーと、その中の始めと終わりのミリ秒）
 */
export type SentenceClip = { endMs: number; key: string; startMs: number }

/**
 * マニフェストから、ブロックの [startOffset, endOffset) に収まる単語の区間を求める（vocabulary-pronunciation README「1 文の区間の求め方」）。
 * 単語が無い・2 つのパートにまたがるときは null
 */
export const buildSentenceClip = (
  manifest: PassageAudioManifest,
  location: { blockIndex: number; endOffset: number; startOffset: number },
): SentenceClip | null => {
  const block = manifest.blocks.find((item) => item.blockIndex === location.blockIndex)
  if (!block) return null
  const hits = block.parts.flatMap((part) =>
    part.words
      .filter(([, , start, end]) => start >= location.startOffset && end <= location.endOffset)
      .map((word) => ({ key: part.key, word })),
  )
  if (hits.length === 0) return null
  const first = hits[0]
  const last = hits[hits.length - 1]
  if (first.key !== last.key) return null
  return { endMs: last.word[1], key: first.key, startMs: first.word[0] }
}
```

### 4. Repository

- `src/repository/word-audio-repository.ts`（新設）と `src/repository/drizzle/word-audio-repository.ts`

```typescript
/** apps/api/src/repository/word-audio-repository.ts */

/**
 * 見出し語の発音の音声（読み取りのみ。生成は cron の generate:word-audio）
 */
export interface WordAudioRepository {
  /**
   * lemmas のうち status = 'ready' の見出し語と mp3 のキー。ready の行は audio_key が必ずある（CHECK）
   */
  findReadyKeysByLemmas(lemmas: string[]): Promise<Map<string, string>>
}
```

- `PassageAudioRepository` に `findByPassageIds(passageIds: number[]): Promise<Map<number, PassageAudioWithPassage>>` を足す（`findByPassageId` を複数にしたもの。`passages` に left join し、状態と公開日時も読む。passage_id → 結果。空の配列なら DB を引かない）
- どちらも `test/repository/` に実 DB のテストを足す（`ready` だけ・空の配列・存在しない id）。`word_audios` の行は `test/fixture/vocabulary.ts` の `insertWordAudio` で入れる

### 5. Service

`getVocabularySession` の `repo` に `passageAudioRepository`・`wordAudioRepository`、`deps` に `audioPublicUrlBase` を足す。カードの型は `VocabularySessionCard`（`VocabularyCardView` に `pronunciation` を足したもの）。カードを組み立てた後に、カードの見出し語と元の問題をまとめて 2 回だけ引く（カードごとに引かない）。

```typescript
/** apps/api/src/service/vocabulary-service.ts */

/**
 * カードの発音の音声。audioPublicUrlBase が null（production で AUDIO_PUBLIC_URL_BASE が未設定）なら単語も 1 文も null
 */
const attachPronunciations = async (
  cards: VocabularyCardView[],
  repo: { passageAudioRepository: PassageAudioRepository; wordAudioRepository: WordAudioRepository },
  audioPublicUrlBase: string | null,
): Promise<VocabularyCardWithPronunciation[]> => {
  if (audioPublicUrlBase === null || cards.length === 0) {
    return cards.map((card) => ({ ...card, pronunciation: { sentence: null, wordUrl: null } }))
  }
  const [wordKeys, passageAudios] = await Promise.all([
    repo.wordAudioRepository.findReadyKeysByLemmas(cards.map((card) => card.lemma)),
    repo.passageAudioRepository.findByPassageIds([...new Set(cards.map((card) => card.passage.id))]),
  ])
  /** …passageId ごとに resolveAudioStatus が ready のマニフェストを引き、buildSentenceClip で区間を求めて buildAudioUrl で URL にする */
}
```

- 1 文の区間は、カードに 1 文があり（`sentence` と `sentenceBlockIndex` がある）、問題の音声が `resolveAudioStatus` で `ready` のときだけ求める
- `getVocabularySummary`（トップの数）は変えない

### 6. Controller と DI

- `VocabularySessionController` のコンストラクタに `PassageAudioRepository`・`WordAudioRepository`・`audioPublicUrlBase` を足し、レスポンスに `pronunciation: { sentence: { end_ms, start_ms, url } | null, word_url }` を足す
- `src/index.ts`：`DrizzleWordAudioRepository` を作り、`VocabularySessionController` に既存の `passageAudioRepository`・`audioPublicUrlBase` と一緒に渡す

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter api lint:fix
pnpm --filter api test
```

### テスト

- `test/lib/build-sentence-clip.test.ts`
  - [ ] 範囲に収まる単語の最初の始めから最後の終わりまで。範囲の境目にかかる単語（一部だけ入る）は含めない（境界値）
  - [ ] ブロックが無い・単語が無いと null
  - [ ] 範囲の単語が 2 つのパートにまたがると null
- `test/lib/extract-sentence.test.ts`：`blockStartOffset` / `blockEndOffset` が、出す範囲（前後を `…` で切ったときは切った後）のブロック上の位置になる
- `test/lib/build-vocabulary-card.test.ts`：用語集・辞書の両方で `sentenceBlockIndex` が入り、1 文が無いときは null
- `test/service/vocabulary-service/getVocabularySession.test.ts`（Repository は `vi.fn()`）
  - [ ] `ready` の見出し語に `wordUrl`（base とキーをつないだもの）、無い見出し語は null
  - [ ] 問題の音声が `ready` なら `sentence` に URL と区間、`pending`・非公開に戻した・公開し直した直後（`updated_at < published_at`）は null
  - [ ] `audioPublicUrlBase` が null なら単語も 1 文も null で、音声の Repository を呼ばない
  - [ ] 見出し語と問題をまとめて 1 回ずつ引く（カードの数だけ呼ばない）
- `test/controller/vocabulary/session.test.ts`（実 DB）
  - [ ] `word_audios` の `ready` の行と、`passage_audios` の `ready` の行（マニフェストに 1 文の単語の時刻）を入れると、カードの `pronunciation` に URL と区間が返る（`toEqual`）
  - [ ] どちらも無いと `{ sentence: null, word_url: null }`
