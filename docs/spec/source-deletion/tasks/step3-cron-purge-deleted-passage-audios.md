# step3: 消えた問題の音声を generate:audio で片付ける

ソースの削除で問題の行が無くなった `passage_audios` の mp3 と行を、却下の問題の音声と同じ処理で消す。方針は [README](../README.md#音声と課金の記録)。

## 対応内容

`findRejected` は却下の問題だけを返す名前なので、取り下げた問題の音声を返す名前に変える。`RejectedPassageAudio` は `WithdrawnPassageAudio`、`purgeRejectedAudios` は `purgeWithdrawnAudios` にする。

`apps/cron/src/repository/drizzle/passage-audio-repository.ts`：

```ts
public async findWithdrawn(staleBefore: Date): Promise<WithdrawnPassageAudio[]> {
  return this._db
    .select({ manifest: passageAudios.manifest, passageId: passageAudios.passageId })
    .from(passageAudios)
    .leftJoin(passages, eq(passages.id, passageAudios.passageId))
    .where(
      and(
        or(isNull(passages.id), eq(passages.status, "rejected")),
        or(isNull(passageAudios.generationStartedAt), lt(passageAudios.generationStartedAt, staleBefore)),
      ),
    )
    .orderBy(asc(passageAudios.passageId))
}
```

## 動作確認

- `apps/cron/test/repository/drizzle/passage-audio-repository.test.ts`：`left join` と、問題の行が無い条件が SQL に入る
- SQL の文字列までのテストなので、ローカル DB で確かめる。ソースを削除した後に `AUDIO_MONTHLY_CHARACTER_LIMIT=1 pnpm generate:audio` を流し（新しい音声は作らない）、問題の行が無い `passage_audios` の mp3 と行が消えること、ログに `audio of a withdrawn passage was deleted` が出ることを見る
