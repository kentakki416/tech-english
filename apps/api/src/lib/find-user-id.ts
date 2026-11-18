import type { Request } from "express"

import type { AuthRequest } from "../middleware/auth"

/**
 * `PUBLIC_PATHS` に含まれるパスは未ログインでも呼べるので、`req.userId` が無いことがある
 */
export const findUserId = (req: Request): number | undefined =>
  (req as AuthRequest).userId
