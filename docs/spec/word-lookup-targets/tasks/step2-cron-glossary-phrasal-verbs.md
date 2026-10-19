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
- In addition, add every phrasal verb in the passage, even easy ones: a verb with a particle or preposition that together have a meaning of their own, such as "opt out of", "set up", "figure out" and "rely on". Use partOfSpeech 句動詞. They do not count toward the 8 to 20 above. Add only phrasal verbs whose words are next to each other in the text; skip forms split by an object, such as "set it up".
```

- `PROMPT_VERSION` を実装した日の日付に上げる
- 用語集の出力のスキーマは変えない（`partOfSpeech` は今も文字列で、`句動詞` は今の選択肢にある）

## 動作確認

- `pnpm --filter cron test -u` でスナップショットを更新し、差分が `PROMPT_VERSION` と上の 1 行だけであることを確かめる
- dev DB の `collected` の本文候補を 1 件だけ生成し（Claude API の費用がかかるので 1 件だけ）、句動詞が用語集に入ること・難しい語句が 8 語句以上あることを確かめる

```bash
pnpm --filter cron generate:questions --passage-id=<collected の本文候補の id>
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -At -c \
  "SELECT part_of_speech, surface, meaning_ja FROM passage_glossary_entries WHERE passage_id = <id> ORDER BY block_index, start_offset"
```
