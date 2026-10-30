# step1-api-document-suggestion

`GET /api/admin/source/suggestion` が、ドキュメントの場所・既定の除外パス・別のライセンス・確認済みのライセンスを返すようにする。理由は [README の設計](../README.md#設計)。

## 対応内容

- `packages/domain/src/const/source.ts`：`SOURCE_SUGGESTION_ERROR_CODES` に `unsupported_repository` を足す
- `packages/schema/src/api-schema/admin/source.ts`：`detectedLicenseSchema` に `conflict_url`・`is_verified`、GitHub のレスポンスに `exclude_globs` を足す
- `apps/api/src/client/github-repository.ts`：`DetectedLicense` に `sha`、`IGitHubRepositoryClient` に次を足す

```ts
listMarkdownPaths(repository: string, ref: string): Promise<string[]>
listDirectoryFiles(repository: string, ref: string, directory: string): Promise<{ htmlUrl: string; name: string; sha: string }[]>
```

- `apps/api/src/const/document-repository.ts`：`VERIFIED_DOCUMENT_REPOSITORIES`・`UNSUPPORTED_DOCUMENT_REPOSITORIES`

```ts
export type VerifiedDocumentRepository = {
  documentsPath: string
  extraExcludeGlobs?: string[]
  hasReadmePages?: boolean
  license?: { path: string; spdx: string }
}
```

- `apps/api/src/lib/source-document-path.ts`：`findDocumentsDirectory(markdownPaths)`・`buildDefaultExcludeGlobs(targetPath, { hasReadmePages })`・`listDirectoryAndAncestors(directory)`
- `apps/api/src/service/source-service.ts`：`suggestGitHubRepositorySource` を、登録できないリポジトリの確認・場所の決定・ライセンスの決定に分ける
- `apps/api/src/controller/admin/source/source-mapper.ts`：レスポンスに足す

## 動作確認

- `test/lib/source-document-path.test.ts`：調査したリポジトリのパスで推定を確かめる。既定の除外は `isTargetPath` に通し、残すページ（`_index.md`・`components/`・`security.md`）と除外するページを確かめる
- `test/client/github-repository.test.ts`：`listMarkdownPaths`・`listDirectoryFiles` の正常系と 404
- `test/service/source-service/suggestSourceFromUrl.test.ts`：トップの URL の推定、確認済みのリポジトリ、別のライセンス、同じ内容の `LICENSE`、default branch 以外、`github/docs`
