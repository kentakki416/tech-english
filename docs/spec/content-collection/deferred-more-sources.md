# 英文の収集：MVP 対象外の設計

[`README.md`](./README.md) の MVP では見送った取得元と、着手するときの設計案。

## 目次

- [JavaScript で描画するサイト](#javascript-で描画するサイト)
- [許諾を得た技術ブログ](#許諾を得た技術ブログ)
- [ShareAlike ライセンス](#sharealike-ライセンス)
- [Issue / Pull Request / Discussion](#issue--pull-request--discussion)
- [管理画面からの収集の即時実行・抽出のプレビュー](#管理画面からの収集の即時実行抽出のプレビュー)

## JavaScript で描画するサイト

### 着手トリガー

- 題材にしたい公式ドキュメントのサイトが、取得した HTML に本文を含まず JavaScript で描画している（試し実行で英単語数がほぼ 0 になる）
- そのドキュメントに GitHub 上の Markdown のソースも無い

### 対象範囲

| | MVP | 着手後 |
| --- | --- | --- |
| サーバーで描画された HTML | ✅ | ✅ |
| JavaScript で描画するサイト | ❌ | ヘッドレスブラウザで描画してから抽出 |

### 設計案

- ソースに「JavaScript の描画が必要」のフラグを持たせ、そのソースだけヘッドレスブラウザ（Playwright の Chromium）で描画してから、MVP と同じ HTML の抽出処理に流す
- Chromium を含むとコンテナイメージが数百 MB 増え、メモリも 1GB 以上必要になる。**通常の `collect:passages` とは別のタスク・別イメージ** にし、必要なソースがあるときだけ動かす

### 既存仕様との差分（着手時のチェックリスト）

- [ ] `content_sources` に描画方式の列を足す
- [ ] 描画用のタスクとイメージを cron とは別に作る（[minimal-deploy](../minimal-deploy/README.md) の ECS タスク定義のメモリを見積もる）
- [ ] 描画にかかる時間を考慮して `COLLECT_MAX_DOCUMENTS_PER_SOURCE` を別に持つ

## 許諾を得た技術ブログ

### 着手トリガー

- 実務に近い「設計の判断」「障害の振り返り」のような文章を題材にしたい要望が強い
- 個別に転載の許諾を取れるブログ（企業の技術ブログなど）が見つかった

### 設計案

- ソースに **許諾の記録**（許諾者、許諾日、許諾の範囲、やり取りの記録の保存場所）を必須項目として持たせる。ライセンスは `LicenseRef-permission` のような独自の値にする
- 取得は MVP のサイトのクロール（`website`）をそのまま使う。RSS / Atom フィードがあれば sitemap の代わりに記事の URL の一覧として読む
- 許諾が取り消されたら、そのソースの公開済みの問題をすべて非公開にできる操作を admin に用意する

### 既存仕様との差分（着手時のチェックリスト）

- [ ] `ALLOWED_LICENSES` に許諾による利用を表す値を追加し、許諾の記録の列を `content_sources` に足す
- [ ] `content_sources` にフィードの URL を足し、URL の発見の手段に加える
- [ ] `SOURCE_KINDS` に `blog` を足し、問題一覧の絞り込みに出す（reading-practice）
- [ ] ソース単位の一括非公開の API と画面

## ShareAlike ライセンス

### 着手トリガー

- MDN など、`CC-BY-SA` のドキュメントを題材にしたい

### 論点

`CC-BY-SA` の英文から作った **和訳・設問・解説は派生物** になり、それらも `CC-BY-SA` で公開する必要がある。

- 問題ごとに「この問題（和訳・設問・解説を含む）は CC-BY-SA 4.0 で提供します」と表示する
- 派生物のライセンスを問題ごとに持つ必要がある（`passages.derivative_license`）
- 将来の有料化で、ShareAlike の問題だけは有料の壁の内側に入れても自由に再配布されうることを許容できるか判断する

### 既存仕様との差分（着手時のチェックリスト）

- [ ] `ALLOWED_LICENSES` に `CC-BY-SA-4.0` 等を追加
- [ ] `passages` に派生物のライセンスを持たせ、出典表示に出す（reading-practice の解答画面・結果画面）
- [ ] 利用規約に派生物のライセンスについて記載する

## Issue / Pull Request / Discussion

**原則として今後も使わない。** Issue などのコメントはリポジトリのライセンスの対象外で、GitHub の利用規約が利用者に与える許可も GitHub 上での表示に限られるため。

使えるのは、リポジトリのファイルとして管理されている文書（`CHANGELOG.md`、`docs/adr/*.md`、`rfcs/*.md` など）で、これは MVP の対象パスの指定で既に取り込める。

## 管理画面からの収集の即時実行・抽出のプレビュー

### 着手トリガー

- ソースを登録してから翌日の cron まで待つのが運用上つらくなった
- サイトのソースの CSS セレクタの調整を、CLI の試し実行ではなく管理画面で行いたくなった（管理者が開発者以外になった）

### 設計案

api（Lambda）の中で収集を実行すると、時間制限（API Gateway の 29 秒）に収まらない。以下のいずれかにする。

| 案 | 内容 | 向いている構成 |
| --- | --- | --- |
| A | api が AWS SDK で `collect:passages --source-id=N` の ECS RunTask を起動する | minimal（worker なし） |
| B | api が Queue に enqueue し、worker が実行する | prd（worker あり） |

抽出のプレビュー（URL を 1 つ入れて抽出結果を見る）は 1 ページの取得で済むため api の中で実行できる。ただし抽出のロジックを cron と api で共有する必要がある。

### 既存仕様との差分（着手時のチェックリスト）

- [ ] api の IAM ロールに `ecs:RunTask` と `iam:PassRole` を足す（案 A）
- [ ] 実行中・完了の状態を admin に出すため、収集の実行記録のテーブルを足す
- [ ] 抽出のロジック（`WebPageClient` と mdast → `PassageBlock[]` の変換）を `apps/cron` から共有パッケージ（例：`@repo/content-extractor`）に移す。api からも取得するので、取得先の制限（SSRF 対策）も一緒に移す
