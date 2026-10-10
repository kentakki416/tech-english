# apps/mobile

Expo + React Native アプリケーション。expo-router によるファイルベースルーティング。

## Commands

```bash
pnpm start        # Expo dev server
pnpm android      # Android で起動
pnpm ios          # iOS で起動
```

## アーキテクチャ

- ファイルベースルーティング: `app/` ディレクトリ
- ナビゲーション: React Navigation（bottom tabs）
- テーマ: `@react-navigation/native`
- 型・スキーマは `@repo/api-schema` から import（**ローカル独自定義は禁止**：API 側の変更に追従できず型不整合バグが発生するため）

## 環境変数

検証は `src/env.ts` に Zod スキーマをインラインで定義（他 app と同じ方針）。参照は必ず `import { env } from "@/env"` を経由する（`process.env.EXPO_PUBLIC_*` の直参照は ESLint の `no-restricted-syntax` で禁止）。

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | yes | - | Express API の origin。実機は localhost に到達できないため開発時は LAN IP を指定する（例: `http://192.168.3.13:8080`） |

値は `.env.local` に置く（Expo が自動で読み込む）。

**`EXPO_PUBLIC_*` はビルド時に JS バンドルへ展開され、クライアントから読み取れる。** 秘密情報は置かず、API 側の env に置いて Express API 経由で扱う。`.env.local` を dotenvx で暗号化しないのもこの理由（公開前提の値しか入らない）。

他 app との差分は 2 点:

- **`safeParse(process.env)` ではなくキーを 1 つずつ静的に列挙する**: babel-preset-expo は `process.env.EXPO_PUBLIC_*` という形の MemberExpression だけをビルド時に置換するため、`process.env` をオブジェクトとして渡しても `EXPO_PUBLIC_*` は入っていない
- **`process.exit(1)` ではなく throw する**: RN ランタイムに `process.exit` は無い。module scope の throw は dev では LogBox の redbox、release では起動時クラッシュになる

なお `process.env.EXPO_OS` は Expo が platform 名へ置換するビルド時定数（開発者が設定する env ではない）なので `src/env.ts` の管理対象外。
