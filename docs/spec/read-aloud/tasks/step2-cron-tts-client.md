# step2-cron-tts-client

`apps/cron` に音声合成のクライアント（Amazon Polly を包む `PollyTtsClient` と、ローカル・テスト用の `FakeTtsClient`）と、読み上げ用テキストの作成・文字位置の変換などの純関数を作る。DB にも生成タスクにもまだ繋がない（[step3](./step3-cron-generate-audio.md)）。設計は [README の読み上げ用のテキストと文字位置の対応](../README.md#読み上げ用のテキストと文字位置の対応)・[読み上げない部分](../README.md#読み上げない部分)。

## 前提

- [step1-db-passage-audios](./step1-db-passage-audios.md)（`AudioWordTiming`）
- [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md)（文字位置の定義）
- [reading-practice step3-api-attempt-start](../../reading-practice/tasks/step3-api-attempt-start.md)（セグメント分割。インラインコードの判定 `` /`[^`\n]+`/g `` をここでも同じにする。ハイライトはこの位置とセグメントの位置の重なりで決まるため）

> **AWS SDK の細かい API は実装時に公式ドキュメントで確認する。** 特に `SynthesizeSpeechCommand` のレスポンスの `AudioStream` をバイト列にする方法（SDK v3 のストリームの扱い）、`RequestCharacters` の型、エラーの `name`、リトライの設定名。以下の SDK 呼び出しは形の目安で、断定ではない。Speech Marks の形式（1 行 1 つの JSON、`start` / `end` は入力テキストの UTF-8 のバイト位置で `end` は含まない）は [Speech mark output](https://docs.aws.amazon.com/polly/latest/dg/output.html) のとおり。

## 対応内容

### 1. 依存とファイル構成

```bash
pnpm --filter cron add @aws-sdk/client-polly
```

| ファイル | 中身 |
| --- | --- |
| `src/const/audio.ts` | `POLLY_MAX_BILLED_CHARACTERS = 3000`、`AUDIO_TEXT_VERSION = 1`（読み上げ用テキストの作り方を変えたら上げる。ハッシュは変わるが、`ready` の行は自動では作り直さない。作り直すときはデプロイの後に `UPDATE passage_audios SET status = 'pending' WHERE status = 'ready'` を流す。[step3 §1](./step3-cron-generate-audio.md#1-対象と流れ)） |
| `src/client/polly/tts-client.ts` | `TtsClient` interface と入出力の型 |
| `src/client/polly/polly-tts-client.ts` | `PollyTtsClient` |
| `src/client/polly/parse-speech-marks.ts` | Speech Marks（1 行 1 JSON）の parse |
| `src/client/polly/fake-tts-client.ts` | `FakeTtsClient`（無音の mp3 と等間隔の時刻） |
| `src/client/polly/errors.ts` | `isFatalTtsError`（step3 が使う） |
| `src/lib/audio/*.ts` | 純関数（下の §3）。`index.ts` で名前を列挙して export |

### 2. クライアント

```ts
/** src/client/polly/tts-client.ts */
export type SynthesizeInput = { text: string; voiceId: string }
export type SynthesizeResult = {
  /** mp3 */
  audio: Buffer
  /** 音声と単語の時刻の 2 リクエストの課金文字数の合計 */
  billedCharacters: number
  marks: SpeechMark[]
}
export interface TtsClient {
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>
}
```

`SpeechMark`（`{ end: number; start: number; time: number; value: string }`。`start` / `end` は送ったテキストの UTF-8 のバイト位置）は `lib/audio/word-timings.ts` に置き、client はそれを import する（lib は client を知らない）。

```ts
/** src/client/polly/polly-tts-client.ts */
export class PollyTtsClient implements TtsClient {
  constructor(private readonly _polly: Pick<PollyClient, "send">) {}

  public async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const base = { Engine: "neural", Text: input.text, TextType: "text", VoiceId: input.voiceId } as const
    /** 音声と単語の時刻は別々のリクエスト（どちらも課金される。README「費用」） */
    const [audioResponse, marksResponse] = await Promise.all([
      this._polly.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "mp3" })),
      this._polly.send(new SynthesizeSpeechCommand({ ...base, OutputFormat: "json", SpeechMarkTypes: ["word"] })),
    ])
    const audio = Buffer.from(await readAudioStream(audioResponse.AudioStream))
    const marks = parseSpeechMarks(new TextDecoder().decode(await readAudioStream(marksResponse.AudioStream)))
    return { audio, billedCharacters: (audioResponse.RequestCharacters ?? 0) + (marksResponse.RequestCharacters ?? 0), marks }
  }
}
```

- `readAudioStream` は `AudioStream` を `Uint8Array` にする private の関数。中身（`transformToByteArray()` が使えるか等）は実装時に確認し、`AudioStream` が無ければ throw する
- `PollyClient` の生成（`region`、リトライの回数）は step3 の task が行う。一時的なエラー（throttling・5xx）は SDK の既定のリトライに任せ、ここでは再試行しない
- `SampleRate` は指定しない（Neural の mp3 の既定は 24000 Hz）
- `parseSpeechMarks(ndjson: string): SpeechMark[]`：空行を飛ばし、各行を Zod（`{ end, start, time, type, value }`）で検証する。`type !== "word"` は捨て、壊れた行があれば throw
- `isFatalTtsError(error: unknown): boolean`：資格情報が無い・権限が無い・voice と engine の組み合わせが不正など、**どの問題でも同じように失敗する設定の誤り** なら true（step3 は失敗回数を増やさずに止める）。対象の `error.name`（資格情報の解決の失敗、`AccessDenied` 系、`EngineNotSupportedException` など）は実装時に SDK のエラー一覧で確認して定数の配列にする

```ts
/** src/client/polly/fake-tts-client.ts */
/**
 * 無音の MPEG-1 Layer III のフレーム（32 kbps・32 kHz・モノラル・CRC なし）。
 * 4 バイトのヘッダの後ろを 0 で埋めた 144 バイトで、1 フレーム = 1152 サンプル = 36 ms
 */
const SILENT_FRAME_HEADER = [0xff, 0xfb, 0x18, 0xc0]
const SILENT_FRAME_BYTES = 144
const SILENT_FRAME_MS = 36
const FAKE_MS_PER_WORD = 300
const FAKE_WORD_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g

/** ローカル（TTS_PROVIDER=fake）とテスト用。外部に通信せず、同じ入力には同じ結果を返す */
export class FakeTtsClient implements TtsClient {
  public async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const words = [...input.text.matchAll(FAKE_WORD_PATTERN)]
    const frameCount = Math.max(1, Math.ceil((words.length * FAKE_MS_PER_WORD) / SILENT_FRAME_MS))
    const durationMs = frameCount * SILENT_FRAME_MS
    const marks = words.map((word, i) => {
      const start = Buffer.byteLength(input.text.slice(0, word.index))
      return { end: start + Buffer.byteLength(word[0]), start, time: Math.floor((i * durationMs) / words.length), value: word[0] }
    })
    return { audio: createSilentMp3(frameCount), billedCharacters: 0, marks }
  }
}
```

- `createSilentMp3(frameCount)` は無音のフレームを `frameCount` 個並べた `Buffer`（ファイルを持たない）
- **実装の最初に、作った mp3 がブラウザの `<audio>` と mobile の `expo-audio` で再生できることを確かめる。** 再生できなければ、ffmpeg 等で作った短い無音の mp3（ID3 タグと Xing ヘッダの無い CBR）を base64 の定数で持ち、必要な長さだけ繰り返す方式に切り替える

### 3. 純関数（`src/lib/audio/`）

env も DB も SDK も知らない。

```mermaid
flowchart LR
    A["PassageBlock.text<br/>（インラインコードのバッククォートを含む）"] -->|buildSpeechText| B["読み上げ用テキスト<br/>（バッククォートを除く）<br/>+ sourceOffsets"]
    B -->|splitSpeechText| C["パート（3,000 文字以下）"]
    C -->|Polly| D["SpeechMark<br/>start / end = UTF-8 のバイト位置"]
    D -->|createUtf8ToUtf16IndexMap| E["パート内の UTF-16 の位置<br/>+ part.start"]
    E -->|mapSpeechRangeToSource| F["元の本文の位置<br/>（マニフェストに保存）"]
```

```ts
/** read-aloud-blocks.ts：code のブロックと、読み上げ用テキストが空白だけのブロックを除く */
export const listReadAloudBlocks = (blocks: PassageBlock[]): { blockIndex: number; text: string }[]

/** speech-text.ts */
export type SpeechText = {
  /** speechText の各位置（UTF-16）の元の本文での位置。末尾に text.length を足す（長さは speechText.length + 1） */
  sourceOffsets: number[]
  speechText: string
}
/** 対になったインラインコードのバッククォートだけを除く（対になっていないバッククォートは残す） */
export const buildSpeechText = (text: string): SpeechText
/** 読み上げ用テキストの [start, end) を元の本文の位置に。end は「最後の文字の次」= sourceOffsets[end - 1] + 1 で求める（閉じのバッククォートを範囲に含めないため） */
export const mapSpeechRangeToSource = (speech: SpeechText, start: number, end: number): { endOffset: number; startOffset: number }

/** utf8-offset.ts：UTF-8 のバイト位置 → UTF-16 の index の表（長さはバイト数 + 1） */
export const createUtf8ToUtf16IndexMap = (text: string): Uint32Array

/** split-speech-text.ts：maxLength 以下なら 1 パート。超えたら文の区切りで分ける */
export type SpeechPart = { start: number; text: string }
export const splitSpeechText = (speechText: string, maxLength: number): SpeechPart[]

/** word-timings.ts：1 パートの SpeechMark をマニフェストの単語の時刻にする */
export const convertSpeechMarksToWordTimings = (input: { durationMs: number; marks: SpeechMark[]; part: SpeechPart; speech: SpeechText }): AudioWordTiming[]

/** text-hash.ts */
export const calculateAudioTextHash = (input: { blocks: PassageBlock[]; voiceId: string }): string

/** mp3-duration.ts */
export const measureMp3DurationMs = (audio: Buffer): number
```

実装の要点：

- **`createUtf8ToUtf16IndexMap`**：`for (const char of text)` でコードポイントごとに、UTF-8 のバイト数（`< 0x80` は 1、`< 0x800` は 2、`< 0x10000` は 3、それ以上は 4）の分だけ表を埋め、UTF-16 の index は `char.length`（サロゲートペアは 2）ずつ進める。コードポイントの途中のバイトはその先頭の index にする。孤立したサロゲートは UTF-8 で U+FFFD（3 バイト）になるので 3 として数える（`Buffer.byteLength` と一致させる）
- **`splitSpeechText`**：区切りの候補は `/[.!?]["')\]]*\s+/g` の一致の直後。`start + maxLength` 以内で最も遠い候補で切り、無ければ最後の空白、それも無ければ `maxLength` で切る（サロゲートペアの間では切らない）。各パートは前後の空白を除き、除いた分 `start` を進める。Polly の上限（課金対象 3,000 文字）は文字数なので、`length`（UTF-16。コードポイント数以上）で比べれば必ず収まる
- **`convertSpeechMarksToWordTimings`**：パートのテキストで表を作り、`mark.start` / `mark.end` を UTF-16 にして `part.start` を足し、`mapSpeechRangeToSource` で元の本文の位置にする。`endMs` は次の単語の `time`、最後の単語はパートの `durationMs`。範囲が空になった単語は捨てる
- **`calculateAudioTextHash`**：`JSON.stringify({ blocks: [[blockIndex, text], ...]（code 以外）, version: AUDIO_TEXT_VERSION, voiceId })` の SHA-256（hex）。和訳とコードのブロックの変更では変わらない。voice を含めるのは、声を変えたときに保存キーを変え、CloudFront の長期キャッシュに古い声が残らないようにするため
- **`measureMp3DurationMs`**：先頭に ID3v2 タグ（`"ID3"`）があれば、ヘッダのサイズ（syncsafe 整数）の分を飛ばす。以降はフレームヘッダ（同期ビット 11 bit）を読み、バージョン・レイヤ・ビットレート・サンプリング周波数・パディングからフレーム長を求めて進め、`サンプル数 ÷ サンプリング周波数` を足し上げる（Layer III は MPEG-1 が 1152、MPEG-2 / 2.5 が 576 サンプル。フレーム長は MPEG-1 が `144 × bitrate ÷ samplerate + padding`、MPEG-2 / 2.5 が `72 × …`）。ビットレートと周波数の表は MPEG オーディオの仕様の表と照らし合わせて書く。フレームが 1 つも読めなければ throw

## 動作確認

```bash
pnpm --filter cron test
pnpm --filter cron lint
```

`test/lib/audio/`（純関数。テストの英文は自作する）：

- [ ] `buildSpeechText`：`` Call `useEffect` here `` → `Call useEffect here`。`u` の位置が元の本文の 6、末尾の番兵が `text.length`。対になっていないバッククォート（`` a ` b ``）は残る。インラインコードの無い本文は位置がそのまま
- [ ] `createUtf8ToUtf16IndexMap`：ASCII は同じ値 / `café ok` の `ok`（バイト 6 → 5）/ `日本語 text` の `text`（バイト 10 → 4）/ `🚀 Launch` の `Launch`（バイト 5 → 3）/ 全角の括弧 `（注）Note` / コードポイントの途中のバイトは先頭の index / 末尾のバイト位置は `text.length`
- [ ] 往復の性質：絵文字・全角記号・インラインコードを含む本文（例 `` 🚀 Run `npm install` — then `cd app`（任意）. ``）で、読み上げ用テキストの各単語の UTF-8 のバイト位置（`Buffer.byteLength` で求める）を `SpeechMark` にして `convertSpeechMarksToWordTimings` に通すと、すべての単語で `text.slice(startOffset, endOffset)` がその単語になる。`npm` の範囲は開きのバッククォートの次から始まり、`install` の範囲は閉じのバッククォートを含まない
- [ ] `convertSpeechMarksToWordTimings`：`endMs` が次の単語の `time`、最後の単語が `durationMs` / 2 つめのパートの単語は `part.start` の分ずれた位置になる
- [ ] `splitSpeechText`：3,000 文字ちょうどは 1 パート / 3,001 文字以上は文の区切りで分かれ、各パートが 3,000 文字以下で、`speechText.slice(part.start, part.start + part.text.length) === part.text` / 区切りの無い長い文は空白で、空白も無ければ 3,000 文字で切れる / 先頭の空白を除いた分 `start` が進む
- [ ] `listReadAloudBlocks`：code のブロックと空白だけのブロックを除き、元の `blockIndex` を保つ
- [ ] `calculateAudioTextHash`：同じ入力は同じ値 / 段落の英文・voice が変わると変わる / code のブロック・和訳が変わっても変わらない
- [ ] `measureMp3DurationMs`：`FakeTtsClient` の 10 フレーム → 360 / MPEG-2 Layer III（24 kHz・32 kbps、ヘッダ `FF F3 44 C0`、96 バイト、1 フレーム 24 ms）を 10 フレーム → 240 / ID3v2 タグ付きでも同じ値 / ランダムなバイト列は throw

`test/client/polly/`：

- [ ] `parseSpeechMarks`：複数行を parse / 空行を飛ばす / `sentence` は捨てる / 壊れた JSON は throw
- [ ] `PollyTtsClient`：偽の `send`（`vi.fn`）に 2 回呼ばれ、片方が `OutputFormat: "mp3"`、もう片方が `OutputFormat: "json"` と `SpeechMarkTypes: ["word"]`。どちらも `Engine: "neural"`・`TextType: "text"`・指定の `VoiceId`。`billedCharacters` が 2 つの `RequestCharacters` の合計（`AudioStream` の偽物は SDK の型に合わせて作る）
- [ ] `FakeTtsClient`：同じ入力に同じ結果 / 単語の数だけ時刻があり等間隔で `durationMs` 未満 / 絵文字を含むテキストでも `start` / `end` が UTF-8 のバイト位置になっている / `measureMp3DurationMs(audio)` が `frameCount × 36`
- [ ] `isFatalTtsError`：配列に入れた `name` のエラーは true、throttling・`TextLengthExceededException`・普通の `Error` は false
