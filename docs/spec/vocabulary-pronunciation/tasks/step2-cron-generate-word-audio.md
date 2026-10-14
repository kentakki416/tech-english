# step2-cron-generate-word-audio

cron に `generate:word-audio` タスクを足す。単語帳に出うる見出し語の発音を Polly で 1 語ずつ作り、`audioStorage` の `words/` に保存して `word_audios` を `ready` にする。流れは `generate:audio`（read-aloud の [step3](../../read-aloud/tasks/step3-cron-generate-audio.md)）にそろえ、1 語 1 行・1 リクエストなので簡単にする。

## 前提

- [step1-db-word-audios](./step1-db-word-audios.md)（`word_audios`、`audio_synthesis_usages.word_audio_id`）
- read-aloud の [step2](../../read-aloud/tasks/step2-cron-tts-client.md)・[step3](../../read-aloud/tasks/step3-cron-generate-audio.md)（`TtsClient`・`FakeTtsClient`・`PollyTtsClient`、`audioStorage`、`AudioSynthesisUsageRepository`、`AUDIO_MONTHLY_CHARACTER_LIMIT`、`fatal-error.ts` の `isFatalAudioGenerationError`）
- 仕様は README の [音声ができるまで](../README.md#音声ができるまで)・[単語の音声の生成タスク](../README.md#単語の音声の生成タスク)・[失敗時の扱い](../README.md#失敗時の扱い)

## 対応内容

### 1. `TtsClient` に mp3 だけの合成を足す

`src/client/polly/tts-client.ts` に `synthesizeAudio` を足す（単語の時刻は要らないので Polly のリクエストは 1 回）。

```typescript
/** apps/cron/src/client/polly/tts-client.ts */
export type SynthesizeAudioResult = {
  audio: Buffer
  /**
   * 課金文字数（mp3 の 1 リクエスト分）
   */
  billedCharacters: number
}

export interface TtsClient {
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>
  /**
   * mp3 だけを作る（単語の発音）。成功したら課金文字数で recordBilledCharacters を呼ぶ（FakeTtsClient は呼ばない）
   */
  synthesizeAudio(input: SynthesizeInput): Promise<SynthesizeAudioResult>
}
```

- `PollyTtsClient.synthesizeAudio`：`synthesize` の mp3 のリクエスト（`OutputFormat: "mp3"`・`Engine: "neural"`・`TextType: "text"`）と同じ組み立てで 1 回だけ送り、`RequestCharacters` を記録する
- `FakeTtsClient.synthesizeAudio`：単語の数 × 300ms の無音の mp3（`createSilentMp3`）、`billedCharacters: 0`

### 2. lib

`src/lib/audio/word-audio.ts`（`lib/audio/index.ts` に名前を列挙して足す）。

```typescript
/** apps/cron/src/lib/audio/word-audio.ts */
import { createHash } from "node:crypto"

/**
 * 単語の発音の text_hash（voice と見出し語の SHA-256 の 16 進）。voice が変わるとキーも変わる
 */
export const calculateWordTextHash = (voiceId: string, lemma: string): string =>
  createHash("sha256").update(`${voiceId}\n${lemma}`).digest("hex")

/**
 * 単語の発音の mp3 の保存キー。見出し語に空白や記号があっても URL に使えるよう、見出し語ではなくハッシュを使う
 */
export const buildWordAudioKey = (textHash: string): string => `words/${textHash}.mp3`
```

### 3. Repository

`src/repository/word-audio-repository.ts`（interface）と `src/repository/drizzle/word-audio-repository.ts`（実装）。確保のトークンは `passage_audios` と同じ考え方（`generation_started_at`）。

```typescript
/** apps/cron/src/repository/word-audio-repository.ts */
import type { WordAudio } from "@repo/domain"

/**
 * 生成タスクが確保した見出し語。結果の書き込みは `WHERE id = ? AND generation_started_at = ?` で行い、
 * 30 分を超えて別の実行に回収・再確保された行を、古い実行が上書きしないようにする
 */
export type ClaimedWordAudio = Pick<WordAudio, "audioKey" | "id" | "lemma" | "status"> & { generationStartedAt: Date }

/**
 * completeClaim の結果。lost_claim は確保が回収・再確保されていた（何も書かない）
 */
export type WordAudioClaimResult = "failed" | "lost_claim" | "ready" | "retry_later"

export interface WordAudioRepository {
  /**
   * 次の順に limit 件まで確保して commit する（短いトランザクション、FOR UPDATE SKIP LOCKED）。
   * ① pending（失敗が 3 回未満の作り直し待ち）② ready で voice_id が今と違う行（ready のまま generation_started_at だけを入れる）
   * ③ まだ行が無い見出し語（調べた単語のうち英和辞書の見出し語と一致するもの〈新しい順〉→ 公開中の問題の用語集の語句〈公開の新しい順〉）。
   *    ON CONFLICT (lemma) DO NOTHING で generating の行を作る
   */
  claimTargets(input: { limit: number; now: Date; voiceId: string }): Promise<ClaimedWordAudio[]>
  /**
   * 結果を書く。ready：audio_key・text_hash・voice_id・billed_characters・generated_at を入れ、attempt_count = 0・last_error = null。
   * failed：attempt_count を増やし、3 回で failed（ready のまま確保した行は ready のまま）。どちらも generation_started_at を null に戻す
   */
  completeClaim(
    claim: ClaimedWordAudio,
    outcome:
      | { audioKey: string; billedCharacters: number; kind: "ready"; textHash: string; voiceId: string }
      | { error: string; kind: "failed" },
    now: Date,
  ): Promise<WordAudioClaimResult>
  /**
   * 確保を外す（失敗の回数を増やさない）。generating は pending に戻し、ready のまま確保した行は generation_started_at だけを null に戻す。
   * 月の上限・設定の誤りで止めるときに使う
   */
  releaseClaim(claim: ClaimedWordAudio): Promise<void>
  /**
   * generating のまま startedBefore より前に確保された行を pending に戻す（件数を返す）
   */
  releaseStaleGenerating(startedBefore: Date): Promise<number>
}
```

候補の SQL（③）の条件は、単語帳の出題の候補（api の `_buildEncountersCte`）のうち「意味が用意できる」部分にそろえる。ユーザーは区別しない。

- 調べた単語：`attempt_word_lookups` の `lower(btrim(lemma))` のうち、`dictionary_entries.headword` と一致するもの（`MAX(created_at)` の新しい順）
- 用語集：`passage_glossary_entries` の `lower(btrim(lemma))` のうち、`passages.status = 'published'` のもの（`MAX(passages.published_at)` の新しい順）
- 両方から `word_audios` に行がある見出し語を除き、`DISTINCT` で重複を除く。1〜200 文字のものだけ（CHECK に合わせる）

`AudioSynthesisUsageRepository.record` の入力を `{ characters, now, target: { passageId } | { wordAudioId } }` にする（`generate:audio` の呼び出しも直す）。月の合計（`sumCharactersSinceFromPrimary`）は今のまま、読み上げと単語を合算する。

### 4. Service

`src/service/audio/generate-word-audio.ts`（`service/audio/index.ts` と `service/index.ts` に足す）。`generate-audio.ts` の月の上限・設定の誤り（`isFatalAudioGenerationError`）の扱いを使い回す。確保の回収の 30 分（`STALE_CLAIM_MINUTES`）は `const/audio.ts` に移して 2 つのタスクで共有する。

```typescript
/** apps/cron/src/service/audio/generate-word-audio.ts */

/**
 * generate:word-audio の 1 回の実行（vocabulary-pronunciation README「単語の音声の生成タスク」）。
 * 1 語でも失敗するか、月の上限で止めたら hasFailure を返す（task が exit 1 にする）
 */
export const generateWordAudio = async (
  input: { limit: number; monthlyCharacterLimit: number; now: () => Date; voiceId: string },
  repo: { audioSynthesisUsageRepository: AudioSynthesisUsageRepository; wordAudioRepository: WordAudioRepository },
  deps: { audioStorage: Storage; ttsClient: TtsClient },
): Promise<{ failedCount: number; hasFailure: boolean; readyCount: number; stoppedByLimit: boolean }> => {
  await repo.wordAudioRepository.releaseStaleGenerating(new Date(input.now().getTime() - STALE_CLAIM_MINUTES * MILLIS_PER_MINUTE))
  const claims = await repo.wordAudioRepository.claimTargets({ limit: input.limit, now: input.now(), voiceId: input.voiceId })
  /** …1 語ずつ：月の上限の確認 → synthesizeAudio → 保存 → completeClaim。上限・設定の誤りでは残りを releaseClaim して止める */
}
```

- 月の上限の見込みは見出し語の文字数（`lemma.length`）で求める（Polly は文字数で課金する。SSML は使わない）
- 保存は `audioStorage.save(buildWordAudioKey(textHash), audio)`（Content-Type は拡張子から `audio/mpeg`。読み上げと同じ）。`completeClaim` が `ready` を返し、前の `audioKey` があって新しいキーと違えば、前の mp3 を消す（消せなくても `warn` で続ける。次の voice の変更まで残るだけ）
- `lost_claim` のときは保存した mp3 を消す（別の実行が同じキーに書いているかもしれないので、キーが同じなら消さない）

### 5. Task と env

- `src/task/generate-word-audio.ts`：`generate-audio.ts` と同じく `createTtsClient`・`createAudioStorage`（`production` で保存先が `local` なら throw）を使い、`generateWordAudio` を呼んで、`hasFailure` なら exit 1。`createTtsClient`・`createAudioStorage`・`assertAudioStorageAllowed` は 2 つのタスクで共有するので `src/runtime/audio-clients.ts` に移す
- `package.json` の scripts に `"generate:word-audio": "dotenvx run -f .env.local -- tsx src/task/generate-word-audio.ts"`（並びは名前順）
- `src/env.ts` に `WORD_AUDIO_MAX_PER_RUN: z.coerce.number().int().positive().default(300)`（JSDoc に「1 回の実行で作る語の数の上限」）。`TTS_PROVIDER`・`TTS_VOICE_ID`・`AUDIO_STORAGE_*`・`AUDIO_MONTHLY_CHARACTER_LIMIT` は `generate:audio` と共有する
- `Dockerfile` の起動はタスク名を引数で渡す形なら変更なし（`generate:audio` と同じ）
- cron の README のタスクの一覧に `generate:word-audio` を足す

## 動作確認

```bash
pnpm --filter cron lint
pnpm --filter cron exec tsc --noEmit
pnpm --filter cron test
```

### テスト

cron のテストは DB を使わない（[apps/cron/CLAUDE.md のテスト戦略](../../../../apps/cron/CLAUDE.md#テスト戦略)）。Repository は生成される SQL の文字列まで、Service は Repository を `vi.fn()` にして確かめ、SQL の動きはローカル DB で確かめる（次の「手で確かめる」）。

- `test/lib/audio/word-audio.test.ts`：`calculateWordTextHash` が voice と見出し語で変わる・同じ入力で同じ値。`buildWordAudioKey` が `words/{hash}.mp3`
- `test/client/polly/polly-tts-client.test.ts`：`synthesizeAudio` が `OutputFormat: "mp3"` で 1 回だけ送り、`RequestCharacters` で `recordBilledCharacters` を呼ぶ。SDK のエラーは記録せずに伝播する
- `test/client/polly/fake-tts-client.test.ts`：`synthesizeAudio` が無音の mp3 と `billedCharacters: 0` を返し、`recordBilledCharacters` を呼ばない
- `test/repository/drizzle/word-audio-repository.test.ts`（SQL の文字列）
  - [ ] `claimTargets`：pending と voice が違う確保中でない ready（失敗が上限未満）を `FOR UPDATE SKIP LOCKED` で選ぶ。pending は generating、ready は `generation_started_at` だけ。残りの枠で候補の SQL（調べた単語〈辞書と一致〉→ 用語集〈公開中〉、新しい順）を引き、`ON CONFLICT (lemma) DO NOTHING` で insert して RETURNING の行だけを確保する
  - [ ] `completeClaim`：ガード（id・状態・確保の時刻）に合わなければ `lost_claim`。ready の値、失敗で pending / failed、ready のまま確保した行は ready のまま
  - [ ] `releaseClaim`・`releaseStaleGenerating`
- `test/service/audio/generate-word-audio.test.ts`（Repository は `vi.fn()`、`TtsClient` は `FakeTtsClient` か課金を記録する偽物、`audioStorage` は `vi.fn()`）
  - [ ] 確保した語ごとに mp3 を保存し、`ready` の outcome を書く。課金文字数を `word_audio_id` で記録する（fake は記録しない）
  - [ ] 月の上限：超える語の手前で止め、残りの確保を外して `isMonthlyLimitReached`（上限ちょうどは作る）
  - [ ] 設定の誤り（`isFatalAudioGenerationError`）で、失敗の回数を増やさずに確保を外して throw
  - [ ] 一時的な失敗で失敗の outcome（上限 3）にし、次の語は続ける
  - [ ] voice の変更で作り直したら前の mp3 を消す（キーが同じなら消さない）。lost_claim は消さない

### 手で確かめる

```bash
cd apps/cron && pnpm generate:word-audio   # TTS_PROVIDER の既定は fake（無音の mp3）
ls ../../.storage/audio/words | head
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c "SELECT lemma, status, audio_key FROM word_audios ORDER BY id LIMIT 10"
```

- [ ] 調べた単語と用語集の語句の行が `ready` になり、`.storage/audio/words/` に mp3 がある
- [ ] もう一度実行しても何も作らない（行がある見出し語は取らない）
- [ ] 2 つを同時に流しても、同じ見出し語を二重に作らない
- [ ] `AUDIO_MONTHLY_CHARACTER_LIMIT=1` で、確保を外して exit 1 になる（行は前の状態のまま）
- [ ] `TTS_VOICE_ID` を変えて流すと、全語を ready のまま作り直し、前の mp3 が消える
