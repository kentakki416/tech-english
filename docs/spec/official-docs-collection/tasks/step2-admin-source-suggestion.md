# step2-admin-source-suggestion

登録の画面に、既定の除外パスと別のライセンスの警告を出す。

## 対応内容

- `apps/admin/src/features/source/source.form.ts`：`isLicenseResolved` に `conflict_url === null` を足す
- `apps/admin/src/features/source/source.labels.ts`：`unsupported_repository` の文言を足す
- `apps/admin/src/components/features/source/SourceSuggestionSummary.tsx`：「除外パス」の行（件数）を足し、`is_verified` のときは「確認済みのライセンス」、`conflict_url` があるときは赤字の警告とリンクを出す
- `apps/admin/src/components/features/source/SourceCreateForm.tsx`：GitHub の除外パスの初期値を `suggestion.exclude_globs` にする

## 動作確認

- 型チェックと lint
- `verify-web-page` skill で、トップの URL の読み込み（Vite）、別のライセンス（ClickHouse）、確認済みのライセンス（Vue）、登録できないリポジトリ（GitHub Docs）を確かめる
