# apps/cron

定期実行タスク。**タスクを 1 回実行して exit する run-once モデル**で、常駐しない。本番は EventBridge Schedule → ECS Scheduled Task / Kubernetes CronJob から起動する。

## 含まれるタスク

| タスク | コマンド | 処理内容 |
| --- | --- | --- |
| `cleanup:old-memos` | `pnpm cleanup:old-memos` | `CLEANUP_MEMO_OLDER_THAN_DAYS`（既定 90）日より前の memo を一括削除 |
| `generate:questions` | `pnpm generate:questions [--passage-id=N]` | `collected` の本文候補から Claude API で設問・和訳・用語集を生成し、解答キーを見ない検証をして `draft` にする（[question-generation](../../docs/spec/question-generation/README.md#生成タスクの動き)）。`ANTHROPIC_API_KEY` が必須。`--passage-id` で 1 件だけ（`collected` でなければ throw。下書きの上限を見ない）。1 件でも `failed` になる、または取得した全件が一時的な失敗で `collected` に戻る（下書き・却下が 0 件）と exit 1 |
| `generate:audio` | `pnpm generate:audio` | 公開済みの問題の読み上げの音声（mp3 と単語の時刻のマニフェスト）を Amazon Polly で作り、`passage_audios` を `ready` にする（[read-aloud](../../docs/spec/read-aloud/README.md#音声の生成タスク)）。本番は 1 時間ごと。`production` 以外の既定は `TTS_PROVIDER=fake`（無音の mp3 と等間隔の単語の時刻。ローカルの確認用）。`polly` で AWS の資格情報を解決できなければ、`production` 以外は warn を出して何もせず exit 0。`production` で `AUDIO_STORAGE_TYPE=local` なら起動時に throw（exit 1）。却下（`rejected`）の問題の mp3 と行は毎回消す。今月の Polly の課金文字数が `AUDIO_MONTHLY_CHARACTER_LIMIT` を超えそうなら止めて exit 1。1 件でも失敗（失敗の上限に達した・次の実行に回した失敗）があれば exit 1 |
| `generate:word-audio` | `pnpm generate:word-audio` | 単語帳に出うる見出し語（調べた単語のうち英和辞書の見出し語と一致するもの・公開中の問題の用語集の語句）の発音の mp3 を Amazon Polly で 1 語ずつ作り、`word_audios` を `ready` にする（[vocabulary-pronunciation](../../docs/spec/vocabulary-pronunciation/README.md#単語の音声の生成タスク)）。本番は 1 時間ごと。音声合成・保存先・月の上限（読み上げと合算）は `generate:audio` と共有する。月の上限で止めたら・1 語でも失敗があれば exit 1 |

## Commands

```bash
pnpm dev               # tsx watch で起動
pnpm cleanup:old-memos # タスクを 1 回実行
pnpm generate:questions --passage-id=42        # 1 件だけ生成（ANTHROPIC_API_KEY が必要）
pnpm generate:audio                            # 読み上げの音声を作る（production 以外は無音の mp3。リポジトリ直下の .storage/audio/ に保存）
pnpm generate:word-audio                       # 単語の発音の音声を作る（同上。.storage/audio/words/ に保存）
pnpm test              # Vitest（DB client を mock するので DB 不要）
```

## レイヤード設計のルール

参考実装: `src/task/cleanup-old-memos.ts` / `src/service/memo/cleanup-old-memos.ts` / `src/repository/drizzle/memo-repository.ts`。

- **`task/<name>.ts`**: cron 1 本 = 1 ファイル。`runTask` で包み、受け取った DB client（Drizzle）で Repository を生成して service に DI するだけ。**閾値計算や件数集計などのドメインロジックを書かない**。サブディレクトリは切らない
- **`service/<domain>/`**: 業務ロジック。`export const` のアロー関数で、Repository は単一でも `repo: { xxxRepository }` のオブジェクト引数で受ける（将来増えてもシグネチャを変えずに済む）。**Repository class を service の中に書かない**
- **`repository/`**: interface は `repository/<name>.ts`、実装は `repository/drizzle/`。interface の引数・戻り値は `@repo/domain` の型か素の値にする。Drizzle の型は実装クラスの内側に閉じる（`@repo/eslint-config/db-boundary` が lint で強制）
- **`lib/`**（任意）: env も DB も知らない純関数のみ
- **`client/<service>/`**（任意）: 外部 API クライアント。env を直接 import せずコンストラクタ DI（`fetch` もコンストラクタで差し替えられるようにしてテストで偽物を渡す）
- **`const/`**（任意）: タスク横断の定数（`const/audio.ts` など）

Repository の interface は api / worker と意図的に分離する（api は CRUD、cron は batch 系と操作セットが違うため）。一方ドメイン型は `@repo/domain` で共有する。

**英文の収集（`collect:passages`）は cron でやめ、worker の `collect-source`（admin の今すぐ収集）に移した**（[manual-collection](../../docs/spec/manual-collection/README.md)。収集の処理と規則は [`apps/worker/CLAUDE.md`](../worker/CLAUDE.md#collect-source英文の収集)）。

### 問題の生成（LLM のクライアントとプロンプト）

`generate:questions`（[question-generation](../../docs/spec/question-generation/README.md#llm-の呼び出し)）が使う Claude API のクライアントとプロンプト。タスクの動きは次の「generate:questions（問題の生成のタスク）」。

| ファイル | 役割 |
| --- | --- |
| `client/anthropic/anthropic-client.ts` | `AnthropicClient`（`@anthropic-ai/sdk` を包む。SDK の `messages` をコンストラクタで受ける）と `ILlmClient`。`createStructuredMessage` 1 つで、生成（`GENERATION_MODEL`）と解答キーを見ない検証（`VERIFICATION_MODEL`）の両方を呼ぶ。`adaptiveThinking: { effort }` を渡したときだけ `thinking: { type: "adaptive" }` と `output_config.effort` を送る（生成だけが渡す）。`createAnthropicClient({ apiKey })` が SDK を `maxRetries: 2`・タイムアウト 10 分で生成して包む（task が 1 回だけ呼ぶ） |
| `client/anthropic/errors.ts` | `LlmRefusalError`（`stop_reason: "refusal"`。`stop_details.category` を持つ）/ `LlmOutputTruncatedError`（`max_tokens` などで途中で切れた。`stopReason` と `usage.output_tokens` の `outputTokens` を持つ）/ `LlmInvalidJsonError`、`isFatalLlmError`（401 / 403 / 404 / `billing_error` だけ true。タスク全体を止める判定） |
| `client/anthropic/structured-output-schema.ts` | `convertZodToStructuredOutputSchema`：Zod（`zod/v4`）→ structured output に渡す JSON Schema。API が受け付けない制約（文字数・数値の範囲・`minItems` の 0 / 1 以外・`$schema`）を落とし、全オブジェクトに `additionalProperties: false`。`allOf` / `$ref` などは throw |
| `prompt/generate-questions.ts` | `PROMPT_VERSION`、`GENERATE_QUESTIONS_SYSTEM_PROMPT`（README の設問・和訳・用語集のルール。英語）、`buildGenerateQuestionsUserContent`（番号つきブロック + 設問数の指示 + 再生成のときは前回の不合格の理由） |
| `prompt/generate-questions-schema.ts` | 出力の Zod スキーマ `generateQuestionsOutputSchema`（vocabulary の設問だけが `vocabularyTarget` を持ち、選択肢の和訳 `choicesJa` を持たない superRefine つき）と、API に渡す `GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA`（refine の前のオブジェクトから読み込み時に 1 回だけ作る定数） |
| `prompt/passage.ts` | `buildPassagePrompt`：本文を `<passage>` / `<block index paragraph type lang translate>` の XML にする（生成と検証で共有）。段落番号は `numberParagraphs`、code には `translate="no"`。本文はエスケープせず属性値だけエスケープ、和訳は渡さない |
| `prompt/verify-questions.ts` / `prompt/verify-questions-schema.ts` | 解答キーを見ない検証の `VERIFY_QUESTIONS_SYSTEM_PROMPT`（推測でも必ず 1 つ選ぶ）、`buildVerifyQuestionsUserContent`（番号つきブロック + シャッフル後の設問と A〜D の選択肢。**正解・解説・根拠は渡さない**）、出力の `verifyQuestionsOutputSchema`（`answers: { choiceIndex, questionNumber }[]`）と `VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA` |

- **SDK の呼び方**：非ストリーミングの `messages.create` に `output_config: { format: { type: "json_schema", schema } }` と、`cache_control: { type: "ephemeral" }` を付けた system の text ブロックを渡す。temperature などのサンプリングの引数は渡さない（新しいモデルは既定以外を受け付けないものがある）。拒否時のサーバー側フォールバック（beta）は使わない
- **thinking と max_tokens**：思考（thinking）のトークンは、内容が返らなくても `max_tokens` に数えられる（[Steering thinking の Cost control](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost)）。`claude-sonnet-5-5` は `thinking` を省略すると adaptive thinking で動き、effort の既定は `high`（`budget_tokens` は 400、思考を止めるのは `between_tools`。[Effort](https://platform.claude.com/docs/en/build-with-claude/effort)・[Troubleshooting thinking](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting)）。structured output では effort が low / medium のときに思考が `max_tokens` まで続くことがあり、high 以上ではほぼ起きない（[Prompting Claude Sonnet 5.5 の Reasoning tasks with JSON output](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5)）。そこで生成は `thinking: { type: "adaptive" }` と `effort: "high"`（`GENERATION_EFFORT`）を明示する（既定と同じ値なのでキャッシュは変わらない。`GENERATION_MODEL` を既定が medium のモデルに変えても下がらない）。`max_tokens`（16000）は SDK の非ストリーミングの上限に近いので上げない。`between_tools`（思考なし）は読解の正解の質が下がるので使わない。検証（Claude Haiku 4.5）は adaptive thinking を 400 で拒否し effort も受け付けないので、thinking も effort も送らない
- **リトライは SDK に任せる**：429 / 408 / 409 / 5xx / タイムアウト / 接続エラーを retry-after か指数バックオフで最大 2 回。自前でリトライを書かない
- **出力の正しさは Zod で確かめる**：structured output は JSON の形（型・enum・必須のキー）までしか強制しない。文字数・配列の長さ・数値の範囲は JSON Schema から落としているので、`createStructuredMessage` は JSON.parse しただけの値を返し、呼び出し側が `generateQuestionsOutputSchema` で検証する（エラーを再生成の指示に使う）
- **`zod/v4`**：cron の zod は 3.25 で、`z.toJSONSchema` は v4 にしか無いため、structured output のスキーマ（`prompt/*-schema.ts`・`structured-output-schema.ts`）だけ `import { z } from "zod/v4"` で書く。SDK の `zodOutputFormat` は `enum` を description に移して制約から外すので使わない
- **プロンプトキャッシュ**：system prompt に日時・件数・本文などの可変値を入れない（可変値は user message）。`usage.cacheReadInputTokens` が 2 回目以降も 0 なら、最小キャッシュ長未満か可変値が混ざっている
- **`PROMPT_VERSION`**：system prompt・user message の形・出力のスキーマを変えたら必ず上げる（`passages.generation_prompt_version` に入る）。`test/prompt/__snapshots__/generate-questions.prompt.txt` に fixture で組み立てた送信内容（system / user / 再生成の user / JSON Schema）を書き出しているので、変えたら `pnpm test -u` で更新して差分をレビューする。検証のプロンプトは `verify-questions.prompt.txt`（検証のプロンプトは生成した内容を変えないので `PROMPT_VERSION` には含めない）

### generate:questions（問題の生成のタスク）

| ファイル | 役割 |
| --- | --- |
| `lib/question-generation/validate-generated-output.ts` | `validateGeneratedOutput`：不合格なら再生成させる検査（Zod・設問数が `calculateQuestionCount` と一致・選択肢が前後の空白と大文字小文字を除いて重複しない・根拠と `vocabularyTarget` のブロック番号が範囲内で code でない）。理由は英語で、そのまま再生成の user message に入る。`isSuitable = false` は以降を見ずに合格 |
| `lib/question-generation/build-draft-content.ts` | `buildDraftContent`：保存する形への加工と要確認の理由（和訳の欠け・根拠の引用が本文に無い・語義設問の対象の追加 / 不在）。用語集の位置は `findSurfaceRange` で本文から求め、見つからない語句は捨てて `droppedGlossary` に入れる（task のログに出る）。語義設問の対象が用語集に無ければ意味が空の項目を足して紐づける。選択肢のシャッフル（`shuffle-choices.ts`、Fisher–Yates、`random` を DI。選択肢の和訳も同じ順に並べ替える）と制限時間の計算もここ。要確認のブロックの表記は `numberParagraphs` の「段落 N」と `numberHeadings` の「見出し N」（api の公開の条件のメッセージと同じ規則） |
| `lib/question-generation/find-verification-mismatches.ts` | 検証モデルの回答を正解と突き合わせ、`verificationChoiceIndex` と「Q3：検証モデルは A を選択（正解は B）」を作る |
| `lib/question-generation/parse-args.ts` | `parseGenerateQuestionsArgs`（`--passage-id` を正の整数に） |
| `lib/question-generation/describe-run-failure.ts` | `describeRunFailure`：実行の件数から exit 1 にすべき理由を返す（`failed` が 1 件以上、または下書き・却下が 0 件で `collected` に戻した件がある）。task が throw に使う |
| `service/passage/generate-questions.ts` | 本体。下書きの上限 → 30 分以上 generating の行の回収 → 上限の件数まで 1 件ずつ「`claimNextCollected` → 生成（不合格なら理由を付けて 1 回だけ再生成）→ `buildDraftContent` → 検証モデル → `saveDraft`」 |
| `repository/passage-repository.ts` | `claimNextCollected`（collected のうち生成を優先したもの〈`generation_prioritized_at` の古い順〉→ 古いものの順で 1 行を `FOR UPDATE SKIP LOCKED` で選び、同じ UPDATE で generating に）/ `saveDraft`（passages の更新と questions / glossary の入れ直しを 1 トランザクション）/ `recordGenerationFailure` / `markRejectedByLlm` / `releaseClaim` / `releaseStaleGenerating` / `countByStatus` / `findStatusById` |

- **claim のガード**：取得した行の更新（`saveDraft` / `markRejectedByLlm` / `recordGenerationFailure` / `releaseClaim`）は `WHERE id = ? AND status = 'generating' AND generation_started_at = ?`。`generation_started_at` を取得のトークンにして、30 分を超えて別の実行に回収・再取得された行を古い実行が上書きしない（0 行なら warn を出して数えない）
- **1 件ずつ取る**：最初にまとめて取らず、1 件ごとに `claimNextCollected` で取ってから処理する。まとめて取ると全件に同じ `generation_started_at` が入り、1 回の実行が 30 分を超えたときに後半の行（まだ処理していない行）が別の実行に回収・再取得され、LLM の費用が二重にかかるため。各行の `generation_started_at` はその行を取った時刻になる。シグナルで中断されても `generating` のまま残るのは処理中の 1 行だけで、30 分を過ぎた後の実行で `collected` に戻る（`releaseStaleGenerating`）
- **失敗の扱い**：API エラー（SDK のリトライ後）・拒否・2 回目の不合格・想定外の例外は `recordGenerationFailure`（回数 +1、3 回目で `failed`、`generation_error` に「種類: メッセージ」）。失敗した件は warn（`passage generation failed`）でログに出す。JSON でない出力は「不合格」として再生成する。出力が `max_tokens` で切れた（`LlmOutputTruncatedError`）ら、同じ上限ですぐに作り直しても切れやすいので再生成せず、一時的な失敗として `recordGenerationFailure` する（次の実行に回す。3 回目で `failed`）。warn に `outputTokens`（`usage.output_tokens`）・`maxTokens`・`stopReason` を出す。`isSuitable = false` は `rejected`（理由が無ければ「LLM が題材に不向きと判定」）
- **設定の誤り（`isFatalLlmError`）**：生成で起きたら失敗回数を増やさずに `releaseClaim` して throw（タスクは exit 1。まだ取っていない行は collected のまま残る）。検証モデルで起きたら、生成の費用を無駄にしないよう下書きを検証なしで保存してから throw する
- **検証モデルの失敗**：API エラー・回答の件数が設問数と合わない・設問番号の重複 / 範囲外は、生成を捨てず `verificationChoiceIndex = null` で保存し、要確認に「検証モデルでの確認に失敗しました」を入れる
- **用語集の id の引き方**：insert の RETURNING の順序に頼らず、`(blockIndex, startOffset, endOffset)` で引く（`buildDraftContent` が同じ位置の項目を 2 つ作らない）

### generate:audio（読み上げの音声の生成）

[read-aloud](../../docs/spec/read-aloud/README.md#音声の生成タスク) の音声を作るタスク。`passage_audios` の列とマニフェスト（`PassageAudioManifest`）の型は read-aloud の README が正本。

| ファイル | 役割 |
| --- | --- |
| `client/polly/polly-tts-client.ts` | `PollyTtsClient`（`@aws-sdk/client-polly` の `send` をコンストラクタで受ける）。`SynthesizeSpeech` を音声（`OutputFormat: "mp3"`）と単語の時刻（`OutputFormat: "json"`・`SpeechMarkTypes: ["word"]`）で 2 回呼ぶ（Neural・`TextType: "text"`。`SampleRate` は指定しない）。課金文字数は 2 つの `RequestCharacters` の合計。成功したリクエストごとに `recordBilledCharacters`（入力の callback）で課金文字数を記録する（`Promise.allSettled` で、片方だけ成功して失敗に終わるときも成功した方を記録してから throw）。`isPollyVoiceId`（task が起動時に `TTS_VOICE_ID` を確かめる） |
| `client/polly/fake-tts-client.ts` | `FakeTtsClient`（`TTS_PROVIDER=fake` とテスト用）。単語の数 × 300 ms の無音の mp3（MPEG-1 Layer III・32 kbps・32 kHz・モノラルのヘッダの後ろを 0 で埋めた 144 バイトのフレームを並べたもの。ffmpeg〈Chrome〉と CoreAudio〈Safari〉で再生できる）と、音声の長さを等分した単語の時刻を返す。課金されないので `recordBilledCharacters` は呼ばない（月の上限に数えない） |
| `client/polly/parse-speech-marks.ts` | Speech Marks（1 行 1 つの JSON。`start` / `end` は UTF-8 のバイト位置）の parse |
| `lib/audio/fatal-error.ts` | `isFatalAudioGenerationError`：音声の生成全体（音声合成・mp3 の保存・使わなくなった mp3 の削除）で、どの問題でも同じく失敗する設定の誤り。Polly（資格情報の解決の失敗・`AccessDeniedException`・無効な資格情報・`EngineNotSupportedException`・`ValidationException` など）と S3（`AccessDenied`・`NoSuchBucket`・`InvalidAccessKeyId`・`SignatureDoesNotMatch`・`ExpiredToken`・リージョン違いの `PermanentRedirect` / `AuthorizationHeaderMalformed`）の `error.name` |
| `lib/audio/audio-voice-id.ts` | `buildAudioVoiceId`：`passage_audios.voice_id` と `text_hash` に入れる voice。`polly` は `TTS_VOICE_ID`、`fake` は `fake:<TTS_VOICE_ID>`（fake と Polly を切り替えたら voice が違う行として作り直し、保存キーも変える） |
| `lib/audio/speech-text.ts` | `buildSpeechText`：本文から対になったインラインコードのバッククォートを除いた読み上げ用テキストと、各位置の元の本文の位置（`sourceOffsets`）。判定は api のセグメント分割と同じ `` /`[^`\n]+`/g ``。`mapSpeechRangeToSource` |
| `lib/audio/utf8-offset.ts` / `word-timings.ts` | Polly の UTF-8 のバイト位置 → UTF-16 の位置の表、Speech Marks → マニフェストの単語の時刻 `[startMs, endMs, startOffset, endOffset]`（位置は元の本文の UTF-16。`endMs` は次の単語の `time`、最後はパートの長さ） |
| `lib/audio/split-speech-text.ts` | 3,000 文字（`POLLY_MAX_BILLED_CHARACTERS`）を超えるブロックを文の区切り → 空白 → 上限の長さの順で切ってパートにする |
| `lib/audio/mp3-duration.ts` | mp3 のフレームを数えて長さを求める（Polly は長さを返さない）。ID3v2 を飛ばし、Layer III のフレームヘッダを読む。先頭の Xing / Info / VBRI のフレームは数えない |
| `lib/audio/audio-storage.ts` | `isAudioStorageAllowed`：`production` の `local` の保存先を使わせない判定（task が起動時に見て throw する） |
| `lib/audio/text-hash.ts` / `read-aloud-blocks.ts` / `audio-key.ts` | `calculateAudioTextHash`（読み上げるブロックの `[blockIndex, text]`・`AUDIO_TEXT_VERSION`・voice〈`buildAudioVoiceId` の値〉の SHA-256。和訳と code の変更では変わらない）、`listReadAloudBlocks`（code と空白だけのブロックを除く）、保存キー `passages/{passageId}/{textHash}/{blockIndex}-{partIndex}.mp3`（作り直しの依頼で hash が前と同じときは `{textHash}-r{確保の時刻のミリ秒}` のディレクトリ）と使わなくなったキー |
| `lib/audio/billed-characters.ts` | `estimateBilledCharacters`（1 問の課金文字数の見込み。読み上げるブロックのパートの文字数〈UTF-16〉の合計 × 2）、`getBillingMonthStart`（UTC の暦月の初め。AWS の請求の月） |
| `service/audio/generate-audio.ts` | 本体。30 分以上 generating の行の回収 → 却下の問題の音声の削除 → `claimTargets` → 1 件ずつ（月の上限の判定 → トランザクションの外で音声合成と保存）→ `completeClaim` → 前の mp3 の削除 |
| `repository/passage-audio-repository.ts` | `claimTargets`（短いトランザクションで `passages` に `passage_audios` を left join し、`FOR UPDATE OF passages SKIP LOCKED` で選ぶ。行が無い・pending・公開し直された ready は insert / `ON CONFLICT` で generating に〈pending か確保中でない ready のときだけ〉、voice が違う・作り直しの依頼がある ready は ready のまま `generation_started_at` だけを入れる〈`updated_at` は今の値のまま〉）/ `completeClaim`（確保したときの状態〈`claimedStatus`〉と確保の時刻のガード付きで `FOR UPDATE` で読み、ready / unchanged は今の本文の hash を求め直して違えば pending）/ `releaseClaim` / `releaseStaleGenerating` / `findRejected`・`deleteByPassageId`（却下の問題の音声） |
| `repository/audio-synthesis-usage-repository.ts` | `audio_synthesis_usages`（課金文字数の追記だけの記録）の `record` と、今月の合計の `sumCharactersSinceFromPrimary`（直前の記録を数え落とさないよう primary から読む） |

- **対象**：`passages.status = 'published'` で、`passage_audios` の行が無い・`pending`・`ready` で音声を作った後に公開し直された（`updated_at < published_at`）・`ready` で `voice_id` が今の `TTS_VOICE_ID` と違う・`ready` で作り直しの依頼（`regenerate_requested_at`）がある問題を `published_at` の古い順に `AUDIO_MAX_PASSAGES_PER_RUN` 件。`ready` は確保中（`generation_started_at` が 30 分以内）なら取らない。`failed` は管理者の再試行（`pending` に戻る）か再公開を待つ
- **ready のまま確保する**：voice が違う・作り直しの依頼がある `ready` の行（公開し直されていないもの）は、状態を `ready` のまま `generation_started_at` を確保のトークンにして確保する（api は前のマニフェストを返し続け、利用者には前の声のまま聞こえる）。`updated_at` は進めない（api は `updated_at < published_at` で公開し直しを判定するため。Drizzle は `$onUpdate` が今の時刻を入れるので `updated_at` を今の列の値で明示する）。成功したら新しいマニフェスト・`voice_id`・`text_hash` で置き換えて前の mp3 を消す。一時的な失敗は `ready` のまま `attempt_count` を増やし（`failed` にしない）、3 回に達した行は取らなくなる（admin の「作り直す」で `attempt_count = 0` に戻る）。設定の誤り・月の上限ではトークンだけを外す。公開し直された `ready` は今までどおり `generating` にして確保する（本文が変わったかもしれないので前のマニフェストを返さない）
- **作り直さない**：前の成功のマニフェストがあり、その本文の hash（voice と `AUDIO_TEXT_VERSION` を含む）が今と同じで、作り直しの依頼も無ければ、行の状態（`ready` / `pending`）を問わず Polly を呼ばずに `unchanged`（`status = 'ready'`・`attempt_count = 0`・`last_error = null` にして `updated_at` だけ進む。api は公開し直しの後でも `ready` を返す）。マニフェストがある行の `text_hash` はそのマニフェストのもので、その mp3 は別の hash の生成が成功して置き換わるまで消さないので、そのまま使える（`manifest` と `generated_at` は `ready` の書き込みで一緒に入るので、`ready` の CHECK 制約も満たす）。同じ本文・同じ voice は同じキーに上書きして同じマニフェストになる（冪等）
- **voice・読み上げ用テキストの版を変えたとき**：`TTS_VOICE_ID` を変えると、`voice_id` が違う `ready` の行が対象になり、次の実行から `AUDIO_MAX_PASSAGES_PER_RUN` 件ずつ作り直す（作り直すまでは前の声のまま `ready`）。`TTS_PROVIDER` を `fake` と `polly` で切り替えたときも同じ（`fake` の `voice_id` は `fake:<TTS_VOICE_ID>`。同じ値だと fake で作った無音の音声が `unchanged` のまま残り、保存キーも同じなので CloudFront の長期キャッシュにも残る）。`AUDIO_TEXT_VERSION`（`const/audio.ts`）を上げただけでは `ready` の行は作り直さない。作り直すときはデプロイの後に作り直しの依頼を入れる（`UPDATE passage_audios SET regenerate_requested_at = timezone('utc', now()), attempt_count = 0, last_error = NULL WHERE status = 'ready'`。日時の列は UTC なので `timezone('utc', ...)` にする。`updated_at` は変えない）。作り直すまでは前の音声のまま `ready`。どちらも公開済みの問題の数だけ Polly の課金がかかるので、`AUDIO_MONTHLY_CHARACTER_LIMIT` を一時的に上げる
- **作り直しの依頼**（admin の「作り直す」。api が `ready` のときだけ `regenerate_requested_at = now`・`attempt_count = 0`・`last_error = null` にする）：本文の hash が同じでも Polly で作り直す（`unchanged` にしない）。hash が同じなら保存キーのディレクトリを `{textHash}-r{確保の時刻のミリ秒}` にする（同じキーに上書きすると CloudFront と端末の長期キャッシュ〈1 年・immutable〉に前の音声が残るため）。成功したら、確保の時刻までに出された依頼を消す（確保の後に出された依頼は残し、次の実行でもう一度作り直す）
- **月の上限**：Polly の `SynthesizeSpeech`（音声と単語の時刻）のリクエストごとに課金文字数を `audio_synthesis_usages` に記録する（`TTS_PROVIDER=fake` は記録しない）。Polly を呼ぶ問題ごとに、作る前に「今月〈UTC の暦月〉の合計 + その問題の見込み〈`estimateBilledCharacters`〉」が `AUDIO_MONTHLY_CHARACTER_LIMIT` を超えるなら、その問題と残りの確保を外し（失敗の回数は増やさない。generating は pending に戻り、ready のまま確保した行は前の音声のまま）、error のログを出して exit 1 で止める。上限を上げるか翌月になれば、次の実行から続きを作る。`unchanged`（Polly を呼ばない）は上限を見ない
- **却下した問題の音声**：毎回、確保の前に、却下（`rejected`）の問題の `passage_audios`（確保中のものを除く）のマニフェストの mp3 をすべて消し、消せたら行も消す（一時的に消せなかった mp3 があれば行を残して次の実行でやり直す。保存先の設定の誤りは throw）。非公開（`draft`）の問題の音声は、再公開で同じ本文なら作り直さずに使うので消さない
- **ライセンスなどで問題の音声を取り下げるとき**：① admin で問題を非公開に戻してから却下する ② 次の `generate:audio`（1 時間以内。急ぐなら手動で RunTask）で S3 から mp3 と行が消える（ログの `audio of a rejected passage was deleted`）③ CloudFront のキャッシュは 1 年なので、`aws cloudfront create-invalidation --distribution-id <id> --paths "/passages/<passage_id>/*"` でそのパスを無効化する（端末の HTTP キャッシュに残った分は消せない）
- **claim のガード**：結果の書き込みは `WHERE passage_id = ? AND status = <確保したときの状態（generating / ready）> AND generation_started_at = ?`。当たらなければ `lost_claim`（何も書かず、mp3 も消さない）。生成中に本文が変わった（非公開 → 修正 → 再公開）ら `text_changed` で `pending` に戻し、今回作った mp3 を消す
- **失敗の扱い**：Polly の throttling・5xx は SDK のリトライ（`POLLY_MAX_ATTEMPTS`）に任せる。それでも失敗した・保存に一時的に失敗した（S3 の 5xx・ローカルの保存先の失敗）問題は `attempt_count` を増やし、3 回目で `failed`（`last_error` に「種類: メッセージ」。ready のまま確保した行は `ready` のまま）。`manifest` と `text_hash` は前の成功のまま残す（前の mp3 のキーを後で消すため）。設定の誤り（`isFatalAudioGenerationError`。Polly と保存先の両方）は失敗回数を増やさずに `releaseClaim` して throw（他の確保済みの行は 30 分後に回収される。保存は音声合成の後なので、保存先の誤りを 1 件の失敗にすると Polly の料金をかけて全件が `failed` に進む）
- **保存先**：`audioStorage`（`@repo/storage`）。`local` はリポジトリ直下の `.storage/audio/`（git に入れない。api が開発環境でだけ `/media` で配信する。`production` の `local` はコンテナの一時領域に mp3 を書いて `ready` にしてしまうので、task が起動時に throw する。cron の他のタスクを止めないよう env のスキーマでは検査しない）、`s3` は `Cache-Control: public, max-age=31536000, immutable`（`AUDIO_CACHE_CONTROL`）。マニフェストにはキーだけを保存し、URL は api が組み立てる。削除の失敗は warn だけ（空のディレクトリは残る）。ただし保存先の設定の誤り（`isFatalAudioGenerationError`）は error を出して throw する（その問題の結果は書き終えたまま。以降も同じく消せず mp3 が残り続けるのに気づけないため）
- **ローカルの AWS の資格情報に注意**：`TTS_PROVIDER` の既定は `production` だけ `polly`、それ以外は `fake`。`TTS_PROVIDER=polly` を明示すると、資格情報は SDK の既定の解決順（環境変数・`~/.aws`・SSO など）で探すので、手元に有効な資格情報があれば実際に Polly を呼んで課金される

### generate:word-audio（単語の発音の音声の生成）

[vocabulary-pronunciation](../../docs/spec/vocabulary-pronunciation/README.md#単語の音声の生成タスク) の単語の音声を作るタスク。`word_audios` の列は vocabulary-pronunciation の README が正本。`generate:audio` と音声合成のクライアント・保存先・月の上限・設定の誤りの判定を共有し、流れ（状態での確保・確保の時刻のガード・3 回で `failed`）もそろえている。

| ファイル | 役割 |
| --- | --- |
| `client/polly/*-tts-client.ts` の `synthesizeAudio` | mp3 だけを作る（単語の時刻は要らないので Polly のリクエストは 1 回）。`FakeTtsClient` は無音の mp3 |
| `lib/audio/word-audio.ts` | `calculateWordTextHash`（voice と見出し語の SHA-256）、`buildWordAudioKey`（`words/{text_hash}.mp3`。見出し語に空白や記号があっても URL に使えるようハッシュにする） |
| `runtime/audio-clients.ts` | `createTtsClient`・`createAudioStorage`・`assertAudioStorageAllowed`（`generate:audio` と共有） |
| `service/audio/generate-word-audio.ts` | 本体。30 分以上 generating の行の回収 → `claimTargets` → 1 語ずつ（月の上限の判定 → トランザクションの外で音声合成と保存）→ `completeClaim` → voice の変更なら前の mp3 の削除 |
| `repository/word-audio-repository.ts` | `claimTargets`（短いトランザクションで ① pending を `FOR UPDATE SKIP LOCKED` で選んで generating に ② まだ行が無い見出し語を調べた単語〈英和辞書と一致〉→ 公開中の問題の用語集の順に新しい順で選び、`ON CONFLICT (lemma) DO NOTHING` で generating の行を insert して候補の順に返す ③ voice が違う ready を `FOR UPDATE SKIP LOCKED` で選び、ready のまま `generation_started_at` だけを入れる。voice の変更は前の音声を出せるので最後）/ `completeClaim` / `releaseClaim` / `releaseStaleGenerating` |

- **候補**：api の単語帳の出題の候補（`VocabularyRepository` の encounters）のうち、意味が用意できる語句と同じ正規化（`lower(btrim(lemma))`）・英和辞書の一致（`headword = 見出し語`）。ユーザーは区別せず、自分が提出していない問題の用語集の語句も作る（単語帳に出る前に作っておくため）
- **月の上限**：1 語ごとに、作る前に「今月の合計（読み上げと合算）+ 見出し語の文字数」が `AUDIO_MONTHLY_CHARACTER_LIMIT` を超えるなら、その語と残りの確保を外して exit 1。課金文字数は `audio_synthesis_usages` に `word_audio_id` つきで記録する（fake は記録しない）
- **voice の変更**：`voice_id` が違う `ready` の行を `ready` のまま確保して作り直し（api は前の音声の URL を返し続ける）、成功したら前の mp3 を消す
- **消さない**：問題の却下・アカウント削除では `word_audios` を消さない（単語の発音は本文でも個人のデータでもないため）
- SQL の確かめ方：`claimTargets` の候補の SQL と確保は SQL の文字列までしかテストしないので、変えたらローカル DB で確かめる（2 回目の実行で何も確保しないこと、2 つを同時に流しても同じ見出し語を二重に作らないこと、`AUDIO_MONTHLY_CHARACTER_LIMIT=1` で確保を外して exit 1 になること、`TTS_VOICE_ID` を変えると全語を ready のまま作り直して前の mp3 が消えること）

## 中断は失敗として扱う

run-once モデルなので、**処理の途中でシグナルを受けて終了した場合はタスクが未完了**を意味する。ここで exit 0 を返すとスケジューラが成功と誤認し、削除が途中で止まっても次回まで気付けない。

task は `src/run-task.ts` の `runTask(name, async ({ db }) => { ... })` で包む。DB client の生成・切断、シグナルの受信、終了コードは `runTask` が持つので、task 側には書かない。

| 結果 | 終了コード |
| --- | --- |
| 成功 | 0 |
| 失敗（task が throw、または DB の切断に失敗） | 1 |
| 中断（SIGTERM / SIGINT） | `128 + シグナル番号`（SIGTERM=143 / SIGINT=130） |

中断時は task の完了を待たずに終了する（実行中のクエリ・トランザクションの完了を待ってから切断する）。**task / service の中でシグナルを見てループを break する処理は書かない**（JS は実行中の処理を外から止められず、チェックが回る前にプロセスが終わる）。代わりに、途中で止まっても次の実行で続きから拾い直せる処理にする。

- `generate:questions` / `generate:audio` / `generate:word-audio`：確保した行は `generation_started_at` が 30 分を過ぎると、次の実行で回収・再確保される
- `cleanup:old-memos`：1 回の `DELETE` なので途中の状態は残らない

引数や env の検査（`generate:questions` の `ANTHROPIC_API_KEY` など）は task の先頭で throw すればよい。DB の Pool は最初のクエリで接続するので、それより前に throw すれば DB に接続しない。

## 環境変数

`src/env.ts` に Zod スキーマをインラインで定義し、import 時に `safeParse` → 失敗なら `process.exit(1)`。

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `NODE_ENV !== "test"` で必須 | - | DB の接続文字列 |
| `CLEANUP_MEMO_OLDER_THAN_DAYS` | no | `90` | 削除対象とする経過日数 |
| `ANTHROPIC_API_KEY` | `generate:questions` で必須 | - | Claude API のキー。他のタスクでは不要なのでスキーマでは任意にし、`generate:questions` の起動時に検査する（空文字は未設定と同じ） |
| `GENERATION_MODEL` | no | `claude-sonnet-5-5` | generate:questions の生成モデル。adaptive thinking と effort を受け付けるモデル（Claude 4.6 以降）にする（生成は両方を明示して送る） |
| `VERIFICATION_MODEL` | no | `claude-haiku-4-5-20251001` | generate:questions の解答キーを見ない検証のモデル |
| `GENERATE_MAX_PASSAGES_PER_RUN` | no | `10` | generate:questions が 1 回の実行で生成する件数の上限（費用の上限） |
| `GENERATE_MAX_PENDING_DRAFTS` | no | `50` | 確認待ちの下書き（`draft`）がこの件数以上なら generate:questions は生成しない（`--passage-id` の指定時は見ない） |
| `TTS_PROVIDER` | no | `production` は `polly`、それ以外は `fake` | generate:audio・generate:word-audio の音声合成。`polly`（Amazon Polly。AWS の資格情報が要る）/ `fake`（無音の mp3 と等間隔の単語の時刻。ローカルの確認用） |
| `TTS_VOICE_ID` | no | `Joanna` | generate:audio・generate:word-audio の Polly の voice（Neural に対応したもの）。変えると `voice_id` が違う `ready` の音声を確保し、次の実行から問題は `AUDIO_MAX_PASSAGES_PER_RUN` 件ずつ、単語は `WORD_AUDIO_MAX_PER_RUN` 語ずつ（作り直し待ち・まだ音声の無い見出し語の後で）作り直す（text_hash にも voice を含むので保存キーも変わる）。`TTS_PROVIDER=fake` のときの `voice_id` は `fake:<TTS_VOICE_ID>` |
| `AWS_REGION` | no | `ap-northeast-1` | generate:audio・generate:word-audio が使う Polly と S3 のリージョン |
| `AUDIO_MAX_PASSAGES_PER_RUN` | no | `20` | generate:audio が 1 回の実行で確保する問題の上限（Polly の費用の上限） |
| `AUDIO_MONTHLY_CHARACTER_LIMIT` | no | `1800000` | generate:audio・generate:word-audio が今月（UTC の暦月。Polly の請求の月）に Polly で課金してよい文字数（`audio_synthesis_usages` の合計。読み上げと単語の発音を合算する）。各問題・各語を作る前に「今月の合計 + 見込み」が超えるなら確保を外して exit 1。既定は read-aloud の費用の試算の「月 300 問を公開」（144 万文字・約 $23）に、失敗の再試行・admin の作り直しの分として 25% の余裕を持たせ、Polly の Budgets の上限（$30）より手前（約 $29）で止まる値。voice の変更などで公開済みの問題をまとめて作り直す月は一時的に上げる |
| `WORD_AUDIO_MAX_PER_RUN` | no | `300` | generate:word-audio が 1 回の実行で確保する見出し語の上限。1 語は mp3 の 1 リクエスト（平均 約 10 文字）で、課金は `AUDIO_MONTHLY_CHARACTER_LIMIT` で読み上げと合算して止める |
| `AUDIO_STORAGE_TYPE` | no | `local` | generate:audio・generate:word-audio の mp3 の保存先。`local` / `s3`。`production` で `local` なら 2 つのタスクは起動時に throw する（スキーマでは検査しないので他のタスクは動く） |
| `AUDIO_STORAGE_LOCAL_DIR` | no | `../../.storage/audio` | `local` の保存先（`apps/cron` からの相対。リポジトリ直下の `.storage/audio/` になり、api の `/media` 配信と共有する） |
| `AUDIO_STORAGE_S3_BUCKET` | `AUDIO_STORAGE_TYPE=s3` で必須 | - | `s3` の保存先の bucket（`superRefine` で検査。空文字は未設定と同じ） |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |

## テスト戦略

- **Repository / Service / lib / client / prompt の unit test のみ**。DB client は `vi.fn()` で mock するので DB 不要。**実在のサイト・リポジトリにリクエストを送るテストは書かない**
- 問題生成の取得・保存の SQL（`claimNextCollected` の `FOR UPDATE SKIP LOCKED`、`recordGenerationFailure` の `CASE`、`saveDraft` のトランザクション、claim のガード）も同じく SQL の文字列までなので、変えたらローカル DB で確かめる（別のトランザクションで行をロックしたまま取得して飛ばされること、31 分前の generating が戻ること、3 回目で failed になること、古い claim で更新されないこと）
- `generate:questions` の service のテストは Repository を `vi.fn()`、`ILlmClient` を偽物（モデル名で生成と検証の応答を分ける）にする。生成の出力の例は `test/lib/question-generation/helpers.ts`
- **Amazon Polly は呼ばない**。`PollyTtsClient` のテストは `send` を `vi.fn()` にした SDK の偽物（`AudioStream` は `Readable` に `transformToByteArray` などを足したもの）を渡す。`generate:audio` の service のテストは Repository を `vi.fn()`、音声合成を `FakeTtsClient`、`audioStorage` を `vi.fn()` にする。音声の確保・結果の書き込みの SQL（`claimTargets` の `FOR UPDATE OF passages SKIP LOCKED` と `ON CONFLICT ... WHERE`・ready のまま確保する `UPDATE`、`completeClaim` のガードと `CASE`）も SQL の文字列までなので、変えたらローカル DB で確かめる（ロック中の問題が飛ばされること、3 回目で failed になること、古い claim で書かれないこと、生成中の本文の変更で pending に戻ること、`voice_id` が違う・作り直しの依頼がある ready が ready のまま確保されて `updated_at` が変わらないこと、確保中・失敗が 3 回の ready が取られないこと、マニフェストのある pending が unchanged で ready に戻ること、却下の問題の行が消えること）。月の上限は `AUDIO_MONTHLY_CHARACTER_LIMIT=1` で `TTS_PROVIDER=fake` のまま確かめられる（fake は記録しないが、見込みだけで上限を超える）
- **Claude API は呼ばない**（キーも費用も要るため）。`AnthropicClient` のテストは `messages.create` を `vi.fn()` にした SDK の偽物を渡し、リトライの設定は実物の SDK に `fetch` の偽物を渡して確かめる（`createAnthropicClient({ apiKey, fetch })`。レスポンスの `retry-after-ms: 1` で待ち時間を縮める）。プロンプトのテストは `test/fixtures/prompt/` の本文で組み立てた文字列を確かめる
- プロンプトのテストは `test/fixtures/prompt/` の fixture を使う。**fixture の英文は自作する**（実在のドキュメントをコピーしない。ライセンスのため）
- 統合テストは無い（task はエントリポイントから直接 service を呼ぶフラットな構造のため）
- テストケースは `describe` を「正常系」「異常系」で分類する（`apps/api` と同じ）
