# step2-cron-glossary-phrasal-verbs

問題の生成で、本文の句動詞をすべて用語集に入れさせる。仕様と理由は [README](../README.md#句動詞の生成)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/cron/src/prompt/generate-questions.ts` | 「5. Glossary」に句動詞の指示、`PROMPT_VERSION` を上げる |
| `apps/cron/test/prompt/__snapshots__/generate-questions.prompt.txt` | 送信内容のスナップショット |

### `generate-questions.ts`

「5. Glossary」の 1 つめの箇条（`Pick 8 to 20 ...`）の後ろに足す。

```text
- In addition, add every phrasal verb in the passage, even easy ones: a verb directly followed by a particle or preposition that together have a meaning of their own. This includes verb + particle ("set up", "figure out", "opt out of") and verb + preposition ("rely on", "consist of", "deal with"). Check every sentence for them. Use partOfSpeech 句動詞. They do not count toward the 8 to 20 above.
- Every surface must be one unit a learner would look up in a dictionary: a word, a phrasal verb or an idiom. Never add a free combination of words or put an object inside the surface (not "add the plugin to", "split the file into", "try to call", "follow the steps"). If an object splits a phrasal verb, as in "set it up", do not add that phrasal verb at all.
```

- 語の並びの指示を別の箇条にし、句動詞に限らずすべての語句に効かせるのは、1 つめの箇条（難しい語句）からも句動詞が入り、品詞を「熟語」にして目的語を含む形が入るため。句動詞だけに書いた案で生成すると、`set it up`・`Add React to`・`split your code into`・`try to use` が入った
- 動詞＋前置詞（`rely on` の型）を例で示し、文ごとに確かめさせるのは、`depends on`・`benefit from` のような型が抜けやすかったため
- 例は検証に使う本文（dev の 116・117）と重ならないものにする（例をそのまま避けるだけで、指示が効いたか分からなくなるため）

- `PROMPT_VERSION` を実装した日の日付に上げる。同じ日にすでに上げていれば `.2` を付ける（`2026-10-19.2`。前の版で生成した問題と区別するため）
- 用語集の出力のスキーマは変えない（`partOfSpeech` は今も文字列で、`句動詞` は今の選択肢にある）

## 動作確認

- `pnpm --filter cron test -u` でスナップショットを更新し、差分が `PROMPT_VERSION` と上の 2 行だけであることを確かめる
- dev DB の `collected` の本文候補を 1 件だけ生成し（Claude API の費用がかかるので 1 件だけ）、句動詞が用語集に入ること・難しい語句が 8 語句以上あることを確かめる

```bash
pnpm --filter cron generate:questions --passage-id=<collected の本文候補の id>
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -At -c \
  "SELECT part_of_speech, surface, meaning_ja FROM passage_glossary_entries WHERE passage_id = <id> ORDER BY block_index, start_offset"
```
