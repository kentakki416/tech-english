import { z } from "zod"

/**
 * apps/mobile の環境変数スキーマ
 *
 * 他 app（api / cron / worker / web / admin）と同じく「Zod で検証し、不正なら即座に
 * 失敗させる」方針だが、Expo / React Native では前提が違うため 2 点だけ作りが異なる。
 *
 * 1. `safeParse(process.env)` ではなくキーを 1 つずつ静的に列挙する
 *    babel-preset-expo は `process.env.EXPO_PUBLIC_*` という形の MemberExpression
 *    だけをビルド時に置換する（production はリテラルへインライン展開、dev は
 *    `expo/virtual/env` 経由の参照へ書き換え）。`process.env` をオブジェクトとして
 *    渡しても `EXPO_PUBLIC_*` は含まれないので、他 app のようには書けない。
 * 2. `process.exit(1)` ではなく throw する
 *    React Native ランタイムに `process.exit` は無い。module scope で throw すると
 *    dev では LogBox の redbox、release ビルドでは起動時クラッシュとして表面化し、
 *    「API URL 未設定のまま全リクエストが失敗する」より早く開発者が気づける。
 *
 * **`EXPO_PUBLIC_*` はビルド時に JS バンドルへ展開され、クライアントから読み取れる。**
 * 秘密情報（API キー / シークレット / トークン）は絶対にここへ置かず、Express API
 * 側の env に置いて API 経由で扱う。そのため `server-only` に相当するガードは無く
 * （RN に server は無い）、代わりに「公開前提の値しか置かない」という規約で守る。
 */
const mobileEnvSchema = z.object({
  /**
   * Express API の origin
   * 実機からは localhost に到達できないため、開発時は LAN IP を指定する
   * （例: `http://192.168.3.13:8080`）。デフォルト値は持たせず必須にしている。
   */
  EXPO_PUBLIC_API_URL: z.string().url(),
})

const result = mobileEnvSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
})

if (!result.success) {
  throw new Error(
    `Invalid environment variables (apps/mobile/.env.local を確認してください):\n${JSON.stringify(result.error.format(), null, 2)}`,
  )
}

export const env = result.data

export type MobileEnv = typeof env
