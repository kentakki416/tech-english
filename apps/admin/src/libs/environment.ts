/**
 * ローカル（`next dev`）だけ true。デプロイした admin は `next build` / `next start` で `production` になる。
 * Next.js が build のときに `process.env.NODE_ENV` を値に置き換えるので、client component からも読める（`server-only` の `env.ts` を通さない）
 */
export const isLocalEnvironment = process.env.NODE_ENV !== "production"
