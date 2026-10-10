import { Router } from "express"

import { adminAuthMiddleware } from "../middleware/admin-auth"

/**
 * admin 向けのルーター（/api/admin にマウントする）。すべてのルートの前に adminAuthMiddleware を通す。
 *
 * /api/admin は PUBLIC_PATHS に入っていてユーザーの JWT 認証を通らないため、
 * /api/admin 配下のルートは必ずこのルーターに足す（別の router に足すと無認証で公開される）。
 * ルートを足すときは、既存の router と同じく optional なコントローラーを受け取り、渡されたものだけを登録する。
 */
export const adminRouter = (): Router => {
  const router = Router()

  router.use(adminAuthMiddleware)

  return router
}
