import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import helmet from "helmet"
import request from "supertest"

import { mediaRouter } from "../../src/routes/media-router"
import { createTestApp } from "../controller/helper"

/**
 * 開発環境のローカルの音声の配信（/media）。本番と同じく helmet と auth middleware の後ろにマウントする
 * （NODE_ENV=test では PUBLIC_PATHS に /media が入るので、Authorization ヘッダなしで読める）
 */
const audioDir = mkdtempSync(join(tmpdir(), "media-router-"))
const AUDIO_KEY = "passages/48/abc123/1-0.mp3"
const AUDIO_BYTES = Buffer.from(Array.from({ length: 1000 }, (_, index) => index % 256))

mkdirSync(join(audioDir, "passages/48/abc123"), { recursive: true })
writeFileSync(join(audioDir, AUDIO_KEY), AUDIO_BYTES)
writeFileSync(join(audioDir, "passages/48/abc123/.hidden.mp3"), AUDIO_BYTES)
/**
 * audioDir の外のファイル（.. で読めてはいけない）
 */
const outsideFile = `${audioDir}-outside.txt`
writeFileSync(outsideFile, "secret")

const app = createTestApp()

app.use(helmet())
app.use("/media", mediaRouter({ audioDir }))

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(() => {
  rmSync(audioDir, { force: true, recursive: true })
  rmSync(outsideFile, { force: true })
})

describe("GET /media/*", () => {
  describe("正常系", () => {
    it("audioDir の mp3 を 200 で返し、Cross-Origin-Resource-Policy を cross-origin にする（認証なし）", async () => {
      const res = await request(app).get(`/media/${AUDIO_KEY}`).buffer(true)

      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toBe("audio/mpeg")
      expect(res.headers["accept-ranges"]).toBe("bytes")
      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin")
      expect(Buffer.compare(res.body as Buffer, AUDIO_BYTES)).toBe(0)
    })

    it("Range: bytes=0-99 なら 206 で先頭の 100 バイトを返す", async () => {
      const res = await request(app).get(`/media/${AUDIO_KEY}`).set("Range", "bytes=0-99").buffer(true)

      expect(res.status).toBe(206)
      expect(res.headers["content-range"]).toBe(`bytes 0-99/${AUDIO_BYTES.length}`)
      expect(res.headers["content-length"]).toBe("100")
      expect(Buffer.compare(res.body as Buffer, AUDIO_BYTES.subarray(0, 100))).toBe(0)
    })
  })

  describe("異常系", () => {
    it("無いファイルは 404 を返す", async () => {
      const res = await request(app).get("/media/passages/48/abc123/9-0.mp3")

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("ディレクトリは一覧を返さず 404 を返す", async () => {
      const res = await request(app).get("/media/passages/48/")

      expect(res.status).toBe(404)
    })

    it(".. を含むパス（エンコードしたもの）で audioDir の外は読めず 404 を返す", async () => {
      const outsideName = outsideFile.split("/").pop()

      const res = await request(app).get(`/media/%2e%2e/${outsideName}`)

      expect(res.status).toBe(404)
      expect(res.text).not.toContain("secret")
    })

    it("ドットファイルは 404 を返す", async () => {
      const res = await request(app).get("/media/passages/48/abc123/.hidden.mp3")

      expect(res.status).toBe(404)
    })

    it("NODE_ENV=production なら（router が登録されていても）ファイルがあっても 404 を返す", async () => {
      vi.stubEnv("NODE_ENV", "production")

      const res = await request(app).get(`/media/${AUDIO_KEY}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })
  })
})
