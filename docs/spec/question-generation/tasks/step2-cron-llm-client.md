# step2-cron-llm-client

`apps/cron` に Claude API のクライアント（`@anthropic-ai/sdk` を包む `AnthropicClient`）、問題生成のプロンプト、LLM の出力の Zod スキーマを作る。DB にも生成タスクにもまだ繋がない（[step3](./step3-cron-generate-questions.md)）。

## 前提

- [step1-db-questions](./step1-db-questions.md)：`QUESTION_TYPES`
- [content-collection step1-db-content-sources](../../content-collection/tasks/step1-db-content-sources.md)：`PassageBlock`、`PASSAGE_DIFFICULTIES`、`PASSAGE_BLOCK_TYPES`
- 何を 1 回で生成させるか・offset を答えさせない理由は README の [LLM の呼び出し](../README.md#llm-の呼び出し)、設問・和訳・用語集のルールは [設問のルール](../README.md#設問のルール) と [和訳と単語の意味のルール](../README.md#和訳と単語の意味のルール)

> **SDK の細かい API は実装時に公式ドキュメントで確認する。** 特に structured output の指定方法（`output_config.format` の形、Zod から JSON Schema を作る helper が cron の zod のバージョンで使えるか）、プロンプトキャッシュの `cache_control` の書き方、エラークラス名、リトライ・タイムアウトの設定名。以下のコード例の SDK 呼び出し部分は形の目安で、断定ではない。

## 対応内容

### 1. 依存と env

- `apps/cron/package.json` の dependencies に `@anthropic-ai/sdk` と、無ければ `@repo/domain`（`workspace:^`）を足す
- `apps/cron/src/env.ts` に追加する。`ANTHROPIC_API_KEY` は `cleanup:old-memos` などには不要なので **スキーマでは optional** にし、必須かどうかは step3 のタスクで検査する。`CLAUDE.md` の環境変数の表にも足す

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | ― | Claude API のキー（`generate:questions` で必須） |
| `GENERATION_MODEL` | `claude-sonnet-5-5` | 生成モデル |
| `VERIFICATION_MODEL` | `claude-haiku-4-5-20251001` | 解答キーを見ない検証のモデル（step3） |

### 2. `AnthropicClient`（`apps/cron/src/client/anthropic/`）

env を import せず、SDK のインスタンスをコンストラクタで受け取る（テストで偽物を渡すため）。service は interface だけを知る。

```typescript
/** apps/cron/src/client/anthropic/anthropic-client.ts */
import Anthropic from "@anthropic-ai/sdk"

export type StructuredMessageRequest = {
  /** 指定すると thinking: adaptive と output_config.effort を明示して送る（生成だけ。検証は省略してモデルの既定に任せる） */
  adaptiveThinking?: { effort: "low" | "medium" | "high" | "xhigh" | "max" }
  /** 出力の JSON Schema（Zod スキーマから作る） */
  jsonSchema: Record<string, unknown>
  /** 思考（thinking）のトークンも含む出力の上限 */
  maxTokens: number
  model: string
  /** 全件共通の指示。キャッシュする */
  system: string
  /** 本文など毎回変わる部分 */
  userContent: string
}

export type StructuredMessageResponse = {
  /** JSON.parse しただけの値。形の検証は呼び出し側の Zod で行う（エラー内容を再生成に使うため） */
  json: unknown
  /** レスポンスが返したモデル ID（generation_model に記録する） */
  model: string
  usage: { cacheReadInputTokens: number, inputTokens: number, outputTokens: number }
}

export interface LlmClient {
  createStructuredMessage(request: StructuredMessageRequest): Promise<StructuredMessageResponse>
}

export class AnthropicClient implements LlmClient {
  private _sdk: Pick<Anthropic, "messages">

  constructor(sdk: Pick<Anthropic, "messages">) {
    this._sdk = sdk
  }

  public async createStructuredMessage(request: StructuredMessageRequest): Promise<StructuredMessageResponse> {
    const message = await this._sdk.messages.create({
      max_tokens: request.maxTokens,
      messages: [{ content: request.userContent, role: "user" }],
      model: request.model,
      /** structured output。adaptiveThinking があれば effort も入れる */
      output_config: {
        ...(request.adaptiveThinking ? { effort: request.adaptiveThinking.effort } : {}),
        format: { schema: request.jsonSchema, type: "json_schema" },
      },
      /** system prompt をキャッシュする。最小キャッシュ長未満だとエラーにならずキャッシュされないだけ */
      system: [{ cache_control: { type: "ephemeral" }, text: request.system, type: "text" }],
      ...(request.adaptiveThinking ? { thinking: { type: "adaptive" } } : {}),
    })
    if (message.stop_reason === "refusal") throw new LlmRefusalError(message.stop_details?.category ?? null)
    /** text が JSON として読めても完結していないので使わない。output_tokens をログに出せるように持たせる */
    if (message.stop_reason === "max_tokens") throw new LlmOutputTruncatedError(message.stop_reason, message.usage.output_tokens)
    /** adaptive thinking のモデルは thinking ブロックも返すので text ブロックを探す */
    const text = message.content.find((block) => block.type === "text")?.text
    return {
      json: parseJsonOrThrow(text),
      model: message.model,
      usage: {
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    }
  }
}
```

- `temperature` などのサンプリングの引数は渡さない（新しいモデルでは既定値以外を受け付けないものがある）
- **thinking と effort**：思考のトークンは内容が返らなくても `max_tokens` に数えられる。`claude-sonnet-5-5` は `thinking` を省略すると adaptive thinking で、effort の既定は `high`。structured output では low / medium のときに思考が `max_tokens` まで続くことがあり、high 以上ではほぼ起きないので、生成は `adaptiveThinking: { effort: "high" }` を明示する（README の [LLM の呼び出し](../README.md#llm-の呼び出し)）。検証の Claude Haiku 4.5 は adaptive thinking を 400 で拒否するので渡さない
- `maxTokens` は生成で `16000`（非ストリーミングで SDK のタイムアウトにかからない上限に近い）。足りずに `max_tokens` で止まったら `LlmOutputTruncatedError`（`stopReason` と `outputTokens`）にし、step3 で一時的な失敗として次の実行に回す（その場では作り直さない）
- 拒否（`refusal`）時のサーバー側フォールバック（beta）は使わない。拒否は 1 件の失敗として step3 で扱う

`apps/cron/src/client/anthropic/errors.ts`：

```typescript
export class LlmRefusalError extends Error { /** stop_details の category を持つ */ }
export class LlmOutputTruncatedError extends Error { /** stopReason と outputTokens（usage.output_tokens）を持つ */ }
export class LlmInvalidJsonError extends Error {}

/**
 * 再試行しても直らない設定の誤り（キーが無効・権限が無い）か。
 * true ならタスク全体を止める（全件の失敗回数を無駄に増やさない。step3）
 */
export const isFatalLlmError = (error: unknown): boolean =>
  error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError
```

SDK の生成は step3 のタスクで行う。**リトライは SDK に任せる**（429 / 5xx / タイムアウト / 接続エラーを指数バックオフで再試行。README の「最大 2 回」は SDK の既定の `maxRetries: 2` と同じだが、明示して渡す）。

```typescript
new AnthropicClient(new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60 * 1000 }))
```

### 3. 出力の Zod スキーマ（`apps/cron/src/prompt/generate-questions-schema.ts`）

LLM の出力のキーは README の表のとおり camelCase。structured output は省略可能なキーより nullable の方が扱いやすいので、任意の値は `null` で表す。

```typescript
const blockRefSchema = z.object({ blockIndex: z.number().int().min(0), surface: z.string().min(1) })

export const generatedQuestionSchema = z.object({
  choices: z.array(z.string().trim().min(1)).length(4),
  correctChoiceIndex: z.number().int().min(0).max(3),
  evidence: z.object({ blockIndex: z.number().int().min(0), quote: z.string().min(1) }),
  explanationJa: z.string().min(1),
  prompt: z.string().min(1),
  type: z.enum(QUESTION_TYPES),
  vocabularyTarget: blockRefSchema.nullable(),
})

export const generateQuestionsOutputSchema = z
  .object({
    difficulty: z.number().int().refine(isPassageDifficulty),
    glossary: z.array(blockRefSchema.extend({
      lemma: z.string().min(1),
      meaningJa: z.string().min(1),
      noteJa: z.string().nullable(),
      partOfSpeech: z.string().min(1),
    })),
    isSuitable: z.boolean(),
    questions: z.array(generatedQuestionSchema),
    translations: z.array(z.object({ blockIndex: z.number().int().min(0), translationJa: z.string().min(1) })),
    unsuitableReason: z.string().nullable(),
  })
  .superRefine((output, ctx) => {
    /** vocabulary の設問だけが対象語句を持つ */
    output.questions.forEach((question, index) => {
      if ((question.type === "vocabulary") !== (question.vocabularyTarget !== null)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "...", path: ["questions", index, "vocabularyTarget"] })
      }
    })
  })

export type GenerateQuestionsOutput = z.infer<typeof generateQuestionsOutputSchema>
```

- `isPassageDifficulty` は無ければ `@repo/domain` の `rules/passage.ts` に type guard として足す
- API に渡す JSON Schema は **refine / superRefine を除いたオブジェクト部分** から作る。文字数・配列の長さ・数値の範囲などは structured output 側で強制されない（SDK が送信前に外すことがある）ので、**最終的な正しさは必ずこの Zod で検証する**
- JSON Schema の作り方（SDK の Zod helper を使うか、`z.toJSONSchema` を使うか）は zod のバージョンを見て決める。作った JSON Schema は定数としてモジュールの読み込み時に 1 回だけ作る（毎回作り直すとキーの順序が揺れてキャッシュが効かなくなる恐れがある）

### 4. プロンプト（`apps/cron/src/prompt/generate-questions.ts`）

```typescript
/** プロンプトを変えたら必ず上げる。生成した問題の generation_prompt_version に入る */
export const PROMPT_VERSION = "2026-10-10"

/** 全件共通。日時や件数など毎回変わる値を入れない（キャッシュが効かなくなる） */
export const GENERATE_QUESTIONS_SYSTEM_PROMPT = `...`

export const buildGenerateQuestionsUserContent = (input: {
  blocks: PassageBlock[]
  questionCount: number
  retryErrors: string[]
  title: string
  wordCount: number
}): string
```

system prompt に書くこと（README の各ルールを英語か日本語で漏れなく反映する）：

- 役割：日本人の中級エンジニア（CEFR B1〜B2）向けの技術英語の読解問題を作る
- 題材の判定：目次だけ・ライセンス文・コード主体・文脈が切れて意味が通らない場合は `isSuitable = false` と理由を返し、他は空配列にする
- 難易度 1〜3 の目安（README の表）
- 設問：指定された数ちょうど、2 種類以上の `type` を混ぜる、設問文と選択肢は英語・解説は日本語、選択肢は 4 つで正解 1 つ、誤答は本文を読まないと誤りと分からないもの、"All of the above" / "None of the above" 禁止、解説に「なぜ正解か」と「主な誤答がなぜ誤りか」、根拠は本文からの **そのままの引用** とブロック番号
- 段落への言及：設問文で段落に触れるときは user message の `paragraph` 番号を使う（ブロック番号ではない）
- vocabulary の設問：対象語句を `vocabularyTarget`（ブロック番号と本文中の表記そのまま）で返し、**同じ語句を必ず用語集にも入れる**
- 和訳：code 以外の全ブロック、エンジニアが普段使う言い方、カタカナ語・英語のまま使う用語は訳さない、インラインコードは訳さず残す
- 用語集：8〜20 語句、中級者が引っかかる単語・熟語・技術英語の言い回し、誰でも知っている単語は入れない、意味は **その文脈での意味を 1 つ**、必要なら一言の補足（`noteJa`）
- 位置：`surface` は本文中の表記をそのまま書く（大文字小文字・活用形も本文どおり）。文字位置は答えない

user message は番号つきのブロックで渡す。ブロック番号（0 始まり、全ブロック）と段落番号（`numberParagraphs`）を両方付け、code には和訳不要と分かる印を付ける。

```text
<passage title="Synchronizing with Effects" word_count="332" question_count="4">
<block index="0" type="heading">Synchronizing with Effects</block>
<block index="1" type="paragraph" paragraph="1">Some components need to ...</block>
<block index="2" type="code" lang="js" translate="no">useEffect(() => { ... })</block>
</passage>
```

- ブロックの本文に含まれる `<` `&` はエスケープせずそのまま入れてよいが、閉じタグと紛れないよう属性値だけはエスケープする
- `retryErrors` が空でないとき（step3 の 1 回だけの再生成）は末尾に「前回の出力は次の理由で不合格だった。直して出力し直すこと」と箇条書きで付ける

## 動作確認

```bash
pnpm --filter cron test
pnpm --filter cron lint
```

外部 SaaS なので SDK はモックする（実 API は呼ばない）。`test/client/anthropic/anthropic-client.test.ts`（`messages.create` を `vi.fn()` にした偽物を渡す）：

- [ ] 正常系：`model` / `max_tokens` / `output_config` が渡り、system の text ブロックに `cache_control` が付く
- [ ] 正常系：thinking ブロックの後ろの text ブロックの JSON を返し、`usage` と `model` を詰め替える
- [ ] 正常系：`adaptiveThinking` を渡すと `thinking: { type: "adaptive" }` と `output_config.effort` が渡り、渡さなければどちらも渡らない
- [ ] 異常系：`stop_reason` が `refusal` → `LlmRefusalError`、`max_tokens` → `outputTokens` を持つ `LlmOutputTruncatedError`（text が JSON として読めても）
- [ ] 異常系：text が JSON でない → `LlmInvalidJsonError`。SDK が throw したらそのまま伝播する
- [ ] `isFatalLlmError`：認証・権限のエラーだけ true（`RateLimitError` / `InternalServerError` は false）

`test/prompt/generate-questions-schema.test.ts`：

- [ ] 正常系：README の表どおりの出力例が通る。`isSuitable = false` で配列が空の出力も通る
- [ ] 異常系：選択肢が 3 つ / 空文字の選択肢 / `correctChoiceIndex = 4` / 難易度 0 / vocabulary なのに `vocabularyTarget` が null / vocabulary 以外なのに対象語句あり

`test/prompt/generate-questions.test.ts`：

- [ ] user message にブロック番号と段落番号が振られ、code に `translate="no"` が付く
- [ ] 同じ入力からは同じ文字列ができる。system prompt に日付などの可変値が入っていない
- [ ] `retryErrors` があるときだけ不合格の理由が末尾に付く

手動確認（任意。キーがある環境で 1 回だけ）：小さなスクリプトで 1 本文を投げ、Zod を通ること、2 回目の呼び出しで `usage.cacheReadInputTokens` が 0 より大きいこと（0 なら最小キャッシュ長未満か、system prompt に可変値が混ざっている）を確かめる。
