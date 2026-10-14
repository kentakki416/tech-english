import express, { NextFunction, Request, Response, Router } from "express"

import { ErrorResponse } from "@repo/api-schema"

/**
 * 見つからないときのレスポンス（ファイルが無い・.. を含むパス・production）
 */
const NOT_FOUND_RESPONSE: ErrorResponse = { error: "Not found", status_code: 404 }

/**
 * 開発環境だけのローカルの音声の配信（/media にマウントする）。cron の generate:audio が .storage/audio/ に書いた mp3 を返す。
 * 本番は S3 + CloudFront で配信するので、production では使わない（docs/spec/read-aloud/README.md「音声の保存と配信」）。
 *
 * dev-login と同じくガードを 1 か所に集めない：index.ts は production でこの router を登録せず、
 * PUBLIC_PATHS も production では /media を含めない。それでも登録されたときのために、この router の先頭でも production なら 404 にする。
 */
export const mediaRouter = (options: { audioDir: string }): Router => {
  const router = Router()

  router.use((req: Request, res: Response, next: NextFunction) => {
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
