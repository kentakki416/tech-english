import express, { NextFunction, Request, Response, Router } from "express"

import { ErrorResponse } from "@repo/api-schema"

/**
 * 見つからないときのレスポンス（ファイルが無い・.. を含むパス・production）
 */
const NOT_FOUND_RESPONSE: ErrorResponse = { error: "Not found", status_code: 404 }

export const mediaRouter = (options: { audioDir: string }): Router => {
  const router = Router()

  router.use((req: Request, res: Response, next: NextFunction) => {
    /**
     * production では index.ts がこの router を登録しないが、誤って登録されても動かないように、ここでも 404 を返す
     */
    if (process.env.NODE_ENV === "production") {
      res.status(404).json(NOT_FOUND_RESPONSE)
      return
    }
    /**
     * helmet の既定（Cross-Origin-Resource-Policy: same-origin）のままだと、別オリジンの web（localhost:3000）の <audio> が読めない。
     * この router の応答だけ cross-origin に上書きする
     */
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
    next()
  })

  /**
   * express.static は Range に対応する（206）。.. を含むパス（エンコードしたものも）は送らずに 403 にし、
   * fallthrough（既定）で 4xx は次の middleware に回るので、最後の 404 になる
   */
  router.use(express.static(options.audioDir, { dotfiles: "deny", index: false }))

  router.use((_req: Request, res: Response) => {
    res.status(404).json(NOT_FOUND_RESPONSE)
  })

  return router
}
