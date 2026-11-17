import http from "node:http"
import type { AddressInfo } from "node:net"

import express from "express"
import request from "supertest"

import { LoggerFactory } from "@repo/logger"

import { unhandledExceptionHandler } from "../../src/middleware/unhandled-exception-handler"

const buildApp = (): express.Express => {
  const app = express()
  app.get("/before-send", () => {
    throw new Error("db down")
  })
  app.get("/while-sending", (_req, res) => {
    res.status(200).write("partial")
    throw new Error("stream failed")
  })
  app.get("/after-send", (_req, res) => {
    res.status(200).json({ ok: true })
    throw new Error("after response")
  })
  app.use(unhandledExceptionHandler)
  return app
}

/**
 * 同じ接続を使い回す agent で GET し、ステータスを返す
 */
const getWithAgent = async (agent: http.Agent, port: number, path: string): Promise<number | undefined> =>
  new Promise((resolve, reject) => {
    http
      .get({ agent, path, port }, (res) => {
        res.resume()
        res.on("end", () => resolve(res.statusCode))
      })
      .on("error", reject)
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("unhandledExceptionHandler", () => {
  describe("正常系", () => {
    it("レスポンスを送る前の例外は 500 を返す", async () => {
      const res = await request(buildApp()).get("/before-send")

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 500 })
    })

    it("レスポンスを送っている途中の例外は、ログに残して接続を切る", async () => {
      const error = vi.spyOn(LoggerFactory.getLogger(), "error")

      await expect(request(buildApp()).get("/while-sending")).rejects.toThrow()

      expect(error).toHaveBeenCalledTimes(1)
      expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(Error), { method: "GET", path: "/while-sending" })
    })

    it("レスポンスを送り終えた後の例外は、ログに残すだけで、同じ接続で次のリクエストも受ける", async () => {
      const error = vi.spyOn(LoggerFactory.getLogger(), "error")
      const server = buildApp().listen(0)
      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
      let connectionCount = 0
      server.on("connection", () => {
        connectionCount += 1
      })

      try {
        const { port } = server.address() as AddressInfo
        const first = await getWithAgent(agent, port, "/after-send")
        const second = await getWithAgent(agent, port, "/after-send")

        expect(first).toBe(200)
        expect(second).toBe(200)
        expect(connectionCount).toBe(1)
        expect(error).toHaveBeenCalledTimes(2)
        expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(Error), { method: "GET", path: "/after-send" })
      } finally {
        agent.destroy()
        await new Promise((resolve) => server.close(resolve))
      }
    })
  })
})
