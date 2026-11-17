import type { Request } from "express"

import type { AuthRequest } from "../middleware/auth"

/**
 * `/api/memo` のように `PUBLIC_PATHS` に含まれるエンドポイントは未ログインでも
 * 呼べるため、`req.userId` は存在しないことがある。
 */
export const findUserId = (req: Request): number | undefined =>
  (req as AuthRequest).userId
