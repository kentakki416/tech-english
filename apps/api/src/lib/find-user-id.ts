import type { Request } from "express"

import type { AuthRequest } from "../middleware/auth"

/**
 * 認証済みユーザーの ID を取り出す。未認証なら undefined。
 *
 * `/api/memo` のように `PUBLIC_PATHS` に含まれるエンドポイントは未ログインでも
 * 呼べるため、`req.userId` は存在しないことがある。
 *
 * **行動イベントは匿名ユーザーを追跡しない方針**なので、未ログイン時は
 * イベント送出そのものをスキップする（`user_id` に 0 や NULL を入れない）。
 * 詳細は docs/spec/user-behavior-events/README.md を参照。
 */
export const findUserId = (req: Request): number | undefined =>
  (req as AuthRequest).userId
