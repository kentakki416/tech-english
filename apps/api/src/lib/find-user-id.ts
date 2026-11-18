import type { Request } from "express"

import type { AuthRequest } from "../middleware/auth"

export const findUserId = (req: Request): number | undefined =>
  (req as AuthRequest).userId
