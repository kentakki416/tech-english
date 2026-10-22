import { ReadableStream } from "node:stream/web"

import { fetch, Response } from "undici"

import { BlockedUrlError, CrawlDelayTooLongError, WebDeadlineExceededError, WebPageClient, type WebPageClientOptions, WebSourceThrottledError } from "../../src/web"

const ORIGIN = "https://docs.example.com"

const USER_AGENT = "TechEnglishBot/1.0 (+https://tech-english.example.com)"

const ROBOTS_URL = `${ORIGIN}/robots.txt`

type Route = () => Response | Promise<Response>

const createHtmlResponse = (body: string, headers: Record<string, string> = {}, status = 200): Response =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers }, status })

const createRedirect = (location: string, status = 301): Response =>
  new Response(null, { headers: { location }, status })

const createRobotsResponse = (content: string): Response =>
  new Response(content, { headers: { "content-type": "text/plain" }, status: 200 })

/**
 * 外部のサイトに接続しないよう fetch を差し替える。routes に無い URL を取りに来たら throw する（client は network_error にする）。
 * robots.txt は routes に無ければ 404（全許可）。時計は sleep と elapsedPerRequestMs でだけ進む
 */
const createHarness = (
  routes: Record<string, Route>,
  options: { clientOptions?: Pick<WebPageClientOptions, "deadlineAt" | "maxCrawlDelaySeconds">; elapsedPerRequestMs?: number } = {},
) => {
  let clock = 1_000_000
  const requestStartedAt: number[] = []
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    requestStartedAt.push(clock)
    clock += options.elapsedPerRequestMs ?? 0
    const route = routes[url] ?? (url === ROBOTS_URL ? () => new Response("Not Found", { status: 404 }) : undefined)
    if (!route) throw new Error(`Unexpected request: ${url}`)
    return route()
  })
  const sleep = vi.fn(async (ms: number) => {
    clock += ms
  })
  const client = new WebPageClient({
    allowedOrigin: ORIGIN,
    fetch: fetchMock,
    now: () => clock,
    requestIntervalMs: 1000,
    sleep,
    userAgent: USER_AGENT,
    ...options.clientOptions,
  })
  return {
    client,
    fetchMock,
    readHeaders: (index: number) => (fetchMock.mock.calls[index][1]?.headers ?? {}) as Record<string, string>,
    requestedUrls: () => fetchMock.mock.calls.map(([url]) => String(url)),
    requestStartedAt,
    sleep,
  }
}

const NO_CONDITIONAL = { etag: null, lastModified: null }

describe("WebPageClient", () => {
  describe("正常系", () => {
    it("fetchPage は User-Agent を付けて GET し、本文・ETag・Last-Modified を返す（条件が無ければ条件付きヘッダを付けない）", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<h1>A</h1>", { etag: "\"v1\"", "last-modified": "Sat, 10 Oct 2026 00:00:00 GMT" }),
      })
      await harness.client.loadRobots()

      const result = await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)

      expect(result).toEqual({
        body: "<h1>A</h1>",
        etag: "\"v1\"",
        finalUrl: `${ORIGIN}/doc/a`,
        kind: "ok",
        lastModified: "Sat, 10 Oct 2026 00:00:00 GMT",
        status: 200,
      })
      expect(harness.requestedUrls()).toEqual([ROBOTS_URL, `${ORIGIN}/doc/a`])
      const headers = harness.readHeaders(1)
      expect(headers["User-Agent"]).toBe(USER_AGENT)
      expect(headers).not.toHaveProperty("If-None-Match")
      expect(headers).not.toHaveProperty("If-Modified-Since")
      expect(harness.fetchMock.mock.calls[1][1]).toMatchObject({ redirect: "manual", signal: expect.any(AbortSignal) })
    })

    it("etag / lastModified があるときだけ If-None-Match / If-Modified-Since を付け、304 は not_modified", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => new Response(null, { status: 304 }),
        [`${ORIGIN}/doc/b`]: () => new Response(null, { status: 304 }),
      })
      await harness.client.loadRobots()

      const both = await harness.client.fetchPage(`${ORIGIN}/doc/a`, { etag: "\"v1\"", lastModified: "Sat, 10 Oct 2026 00:00:00 GMT" })
      const etagOnly = await harness.client.fetchPage(`${ORIGIN}/doc/b`, { etag: "\"v2\"", lastModified: null })

      expect(both).toEqual({ kind: "not_modified", status: 304 })
      expect(etagOnly).toEqual({ kind: "not_modified", status: 304 })
      expect(harness.readHeaders(1)).toMatchObject({ "If-Modified-Since": "Sat, 10 Oct 2026 00:00:00 GMT", "If-None-Match": "\"v1\"" })
      expect(harness.readHeaders(2)["If-None-Match"]).toBe("\"v2\"")
      expect(harness.readHeaders(2)).not.toHaveProperty("If-Modified-Since")
    })

    it.each([404, 410, 500])("%s は http_error", async (status) => {
      const harness = createHarness({ [`${ORIGIN}/doc/a`]: () => createHtmlResponse("error", {}, status) })
      await harness.client.loadRobots()

      expect(await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)).toEqual({ kind: "http_error", status })
    })

    it("Content-Type が text/html でなければ not_html", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }),
      })
      await harness.client.loadRobots()

      expect(await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL))
        .toEqual({ kind: "skipped", reason: "not_html", status: 200 })
    })

    it("Content-Length が 2MB を超えれば読まずに too_large", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<p>small</p>", { "content-length": String(3 * 1024 * 1024) }),
      })
      await harness.client.loadRobots()

      expect(await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL))
        .toEqual({ kind: "skipped", reason: "too_large", status: 200 })
    })

    it("Content-Length が無く、読みながら 2MB を超えたら読むのをやめて too_large", async () => {
      const chunk = new Uint8Array(512 * 1024).fill(0x61)
      let pulledChunkCount = 0
      const stream = new ReadableStream<Uint8Array>({
        pull: (controller) => {
          pulledChunkCount += 1
          if (pulledChunkCount > 20) controller.close()
          else controller.enqueue(chunk)
        },
      })
      const harness = createHarness({ [`${ORIGIN}/doc/a`]: () => new Response(stream, { headers: { "content-type": "text/html" } }) })
      await harness.client.loadRobots()

      const result = await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)

      expect(result).toEqual({ kind: "skipped", reason: "too_large", status: 200 })
      expect(pulledChunkCount).toBeLessThan(10)
    })

    it("Content-Type の charset で復号し、対応していない charset は UTF-8 にする", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/latin1`]: () => new Response(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), {
          headers: { "content-type": "text/html; charset=ISO-8859-1" },
        }),
        [`${ORIGIN}/doc/unknown`]: () => new Response("café", { headers: { "content-type": "text/html; charset=x-unknown" } }),
      })
      await harness.client.loadRobots()

      const latin1 = await harness.client.fetchPage(`${ORIGIN}/doc/latin1`, NO_CONDITIONAL)
      const unknown = await harness.client.fetchPage(`${ORIGIN}/doc/unknown`, NO_CONDITIONAL)

      expect(latin1).toMatchObject({ body: "café", kind: "ok" })
      expect(unknown).toMatchObject({ body: "café", kind: "ok" })
    })

    it("同じオリジンへのリダイレクトは 3 回までたどり、たどり着いた URL を finalUrl にする", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => createRedirect("/doc/b"),
        [`${ORIGIN}/doc/b`]: () => createRedirect(`${ORIGIN}/doc/c`, 302),
        [`${ORIGIN}/doc/c`]: () => createRedirect("d", 308),
        [`${ORIGIN}/doc/d`]: () => createHtmlResponse("<h1>D</h1>"),
      })
      await harness.client.loadRobots()

      const result = await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)

      expect(result).toMatchObject({ finalUrl: `${ORIGIN}/doc/d`, kind: "ok", status: 200 })
      expect(harness.requestedUrls().slice(1)).toEqual([`${ORIGIN}/doc/a`, `${ORIGIN}/doc/b`, `${ORIGIN}/doc/c`, `${ORIGIN}/doc/d`])
    })

    it("4 回目のリダイレクトは too_many_redirects", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/1`]: () => createRedirect("/doc/2"),
        [`${ORIGIN}/doc/2`]: () => createRedirect("/doc/3"),
        [`${ORIGIN}/doc/3`]: () => createRedirect("/doc/4"),
        [`${ORIGIN}/doc/4`]: () => createRedirect("/doc/5"),
      })
      await harness.client.loadRobots()

      const result = await harness.client.fetchPage(`${ORIGIN}/doc/1`, NO_CONDITIONAL)

      expect(result).toEqual({ kind: "skipped", reason: "too_many_redirects", status: 301 })
      expect(harness.requestedUrls()).not.toContain(`${ORIGIN}/doc/5`)
    })

    it.each([
      ["別オリジン", "https://evil.example.com/doc/a"],
      ["http", "http://docs.example.com/doc/a"],
      ["別ポート", "https://docs.example.com:8443/doc/a"],
      ["メタデータの IP", "https://169.254.169.254/latest/meta-data/"],
    ])("%s への Location は redirect_not_allowed で、リダイレクト先にリクエストしない", async (_label, location) => {
      const harness = createHarness({ [`${ORIGIN}/doc/a`]: () => createRedirect(location, 302) })
      await harness.client.loadRobots()

      const result = await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)

      expect(result).toEqual({ kind: "skipped", reason: "redirect_not_allowed", status: 302 })
      expect(harness.requestedUrls()).toEqual([ROBOTS_URL, `${ORIGIN}/doc/a`])
    })

    it("robots.txt で禁止のパスはリクエストせず robots_disallowed（リダイレクト先も検査する）", async () => {
      const harness = createHarness({
        [ROBOTS_URL]: () => createRobotsResponse("User-agent: *\nDisallow: /private/\n\nUser-agent: TechEnglishBot\nDisallow: /doc/secret\n"),
        [`${ORIGIN}/doc/moved`]: () => createRedirect("/doc/secret/page"),
      })
      await harness.client.loadRobots()

      const direct = await harness.client.fetchPage(`${ORIGIN}/doc/secret/x`, NO_CONDITIONAL)
      const redirected = await harness.client.fetchPage(`${ORIGIN}/doc/moved`, NO_CONDITIONAL)

      expect(direct).toEqual({ kind: "skipped", reason: "robots_disallowed", status: null })
      expect(redirected).toEqual({ kind: "skipped", reason: "robots_disallowed", status: null })
      expect(harness.requestedUrls()).toEqual([ROBOTS_URL, `${ORIGIN}/doc/moved`])
      expect(harness.client.isAllowedByRobots(`${ORIGIN}/private/a`)).toBe(true)
      expect(harness.client.isAllowedByRobots(`${ORIGIN}/doc/secret`)).toBe(false)
    })

    it("robots.txt が 404 なら全許可", async () => {
      const harness = createHarness({})

      await harness.client.loadRobots()

      expect(harness.client.isAllowedByRobots(`${ORIGIN}/anything`)).toBe(true)
    })

    it("loadRobots の前は isAllowedByRobots が false で、fetchPage もリクエストしない", async () => {
      const harness = createHarness({ [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<h1>A</h1>") })

      expect(harness.client.isAllowedByRobots(`${ORIGIN}/doc/a`)).toBe(false)
      expect(await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL))
        .toEqual({ kind: "skipped", reason: "robots_disallowed", status: null })
      expect(harness.fetchMock).not.toHaveBeenCalled()
    })

    it("連続するリクエストの間は、前回の開始から 1000ms 経つまで sleep する", async () => {
      const harness = createHarness({ [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<h1>A</h1>") }, { elapsedPerRequestMs: 300 })
      await harness.client.loadRobots()

      await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)

      expect(harness.sleep).toHaveBeenCalledTimes(1)
      expect(harness.sleep).toHaveBeenCalledWith(700)
      expect(harness.requestStartedAt[1] - harness.requestStartedAt[0]).toBe(1000)
    })

    it("Crawl-delay: 5 なら 5000ms 空ける", async () => {
      const harness = createHarness({
        [ROBOTS_URL]: () => createRobotsResponse("User-agent: TechEnglishBot\nCrawl-delay: 5\nAllow: /\n"),
        [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<h1>A</h1>"),
        [`${ORIGIN}/doc/b`]: () => createHtmlResponse("<h1>B</h1>"),
      })
      await harness.client.loadRobots()

      await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)
      await harness.client.fetchPage(`${ORIGIN}/doc/b`, NO_CONDITIONAL)

      expect(harness.sleep.mock.calls).toEqual([[5000], [5000]])
      expect(harness.requestStartedAt).toEqual([1_000_000, 1_005_000, 1_010_000])
    })

    it("Crawl-delay が上限（30 秒）ちょうどなら従って 30000ms 空ける", async () => {
      const harness = createHarness({
        [ROBOTS_URL]: () => createRobotsResponse("User-agent: *\nCrawl-delay: 30\nAllow: /\n"),
        [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<h1>A</h1>"),
      })
      await harness.client.loadRobots()

      await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)

      expect(harness.sleep.mock.calls).toEqual([[30_000]])
    })
  })

  describe("異常系", () => {
    it.each([
      ["http", "http://docs.example.com/doc/a"],
      ["別オリジン", "https://evil.example.com/doc/a"],
      ["URL でない", "not a url"],
    ])("fetchPage は %s の URL でリクエストせずに BlockedUrlError", async (_label, url) => {
      const harness = createHarness({})
      await harness.client.loadRobots()

      await expect(harness.client.fetchPage(url, NO_CONDITIONAL)).rejects.toBeInstanceOf(BlockedUrlError)
      expect(harness.requestedUrls()).toEqual([ROBOTS_URL])
    })

    it.each([429, 503])("%s は Retry-After つきの WebSourceThrottledError", async (status) => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => createHtmlResponse("busy", { "retry-after": "120" }, status),
      })
      await harness.client.loadRobots()

      const promise = harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)

      await expect(promise).rejects.toBeInstanceOf(WebSourceThrottledError)
      await expect(promise).rejects.toMatchObject({ retryAfter: "120", status, url: `${ORIGIN}/doc/a` })
    })

    it("タイムアウト・接続エラーは network_error", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => {
          throw new DOMException("The operation was aborted due to timeout", "TimeoutError")
        },
      })
      await harness.client.loadRobots()

      expect(await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL))
        .toEqual({ errorMessage: "The operation was aborted due to timeout", kind: "network_error" })
    })

    it("lookup が弾いた接続（fetch failed の cause が BlockedUrlError）は network_error にせず throw する", async () => {
      const harness = createHarness({
        [`${ORIGIN}/doc/a`]: () => {
          throw Object.assign(new TypeError("fetch failed"), { cause: new BlockedUrlError("docs.example.com") })
        },
      })
      await harness.client.loadRobots()

      await expect(harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)).rejects.toBeInstanceOf(BlockedUrlError)
    })

    it("robots.txt が 500 なら loadRobots が throw する", async () => {
      const harness = createHarness({ [ROBOTS_URL]: () => new Response("error", { status: 500 }) })

      await expect(harness.client.loadRobots()).rejects.toThrow("Failed to fetch robots.txt: 500")
    })

    it("robots.txt がネットワークエラーなら loadRobots が throw する", async () => {
      const harness = createHarness({
        [ROBOTS_URL]: () => {
          throw new TypeError("fetch failed")
        },
      })

      await expect(harness.client.loadRobots()).rejects.toThrow("Failed to fetch robots.txt")
    })

    it("robots.txt の 429 / 503 は WebSourceThrottledError", async () => {
      const harness = createHarness({ [ROBOTS_URL]: () => new Response("busy", { status: 503 }) })

      await expect(harness.client.loadRobots()).rejects.toBeInstanceOf(WebSourceThrottledError)
    })

    it.each([
      ["TechEnglishBot 向け", "User-agent: TechEnglishBot\nCrawl-delay: 3600\nAllow: /\n", 3600],
      ["全ボット向け", "User-agent: *\nCrawl-delay: 30.5\n", 30.5],
    ])("Crawl-delay が上限（30 秒）を超える（%s）と loadRobots が CrawlDelayTooLongError を throw し、ページも取得しない", async (_, robotsTxt, crawlDelaySeconds) => {
      const harness = createHarness({
        [ROBOTS_URL]: () => createRobotsResponse(robotsTxt),
        [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<h1>A</h1>"),
      })

      const error: unknown = await harness.client.loadRobots().catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(CrawlDelayTooLongError)
      expect(error).toMatchObject({ crawlDelaySeconds, maxCrawlDelaySeconds: 30, url: ROBOTS_URL })
      expect(await harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL))
        .toEqual({ kind: "skipped", reason: "robots_disallowed", status: null })
      expect(harness.requestedUrls()).toEqual([ROBOTS_URL])
      expect(harness.sleep).not.toHaveBeenCalled()
    })

    it("maxCrawlDelaySeconds を渡すと、それを超える Crawl-delay で CrawlDelayTooLongError", async () => {
      const harness = createHarness(
        { [ROBOTS_URL]: () => createRobotsResponse("User-agent: *\nCrawl-delay: 11\n") },
        { clientOptions: { maxCrawlDelaySeconds: 10 } },
      )

      await expect(harness.client.loadRobots()).rejects.toBeInstanceOf(CrawlDelayTooLongError)
    })

    it("期限を過ぎる時刻に送ることになるリクエストは、待たずに送らず WebDeadlineExceededError", async () => {
      const harness = createHarness(
        {
          [ROBOTS_URL]: () => createRobotsResponse("User-agent: *\nCrawl-delay: 10\n"),
          [`${ORIGIN}/doc/a`]: () => createHtmlResponse("<h1>A</h1>"),
        },
        { clientOptions: { deadlineAt: 1_000_000 + 5_000 } },
      )
      await harness.client.loadRobots()

      await expect(harness.client.fetchPage(`${ORIGIN}/doc/a`, NO_CONDITIONAL)).rejects.toBeInstanceOf(WebDeadlineExceededError)
      expect(harness.requestedUrls()).toEqual([ROBOTS_URL])
      expect(harness.sleep).not.toHaveBeenCalled()
    })

    it("期限までに縮めたタイムアウトで止まったリクエストは network_error にせず WebDeadlineExceededError", async () => {
      let clock = 1_000_000
      const client = new WebPageClient({
        allowedOrigin: ORIGIN,
        deadlineAt: clock + 3_000,
        fetch: vi.fn<typeof fetch>(async () => {
          clock += 3_000
          throw new DOMException("The operation was aborted due to timeout", "TimeoutError")
        }),
        now: () => clock,
        requestIntervalMs: 1000,
        sleep: async () => undefined,
        userAgent: USER_AGENT,
      })

      await expect(client.loadRobots()).rejects.toBeInstanceOf(WebDeadlineExceededError)
    })

    it("別のボット向けの大きい Crawl-delay は TechEnglishBot に影響しない", async () => {
      const harness = createHarness({
        [ROBOTS_URL]: () => createRobotsResponse("User-agent: SlowBot\nCrawl-delay: 3600\n\nUser-agent: *\nAllow: /\n"),
      })

      await expect(harness.client.loadRobots()).resolves.toBeUndefined()
    })

    describe("実際の undici の fetch と名前解決（外部には接続しない）", () => {
      it("localhost は接続のときの名前解決で弾かれて BlockedUrlError", async () => {
        const client = new WebPageClient({ allowedOrigin: "https://localhost", requestIntervalMs: 1000, userAgent: USER_AGENT })

        await expect(client.loadRobots()).rejects.toBeInstanceOf(BlockedUrlError)
      })

      it.each(["https://127.0.0.1", "https://[::1]", "https://169.254.169.254"])(
        "IP アドレスのホスト %s は名前解決を通らないので、リクエストの前に BlockedUrlError",
        async (origin) => {
          const fetchMock = vi.fn<typeof fetch>()
          const client = new WebPageClient({ allowedOrigin: origin, fetch: fetchMock, requestIntervalMs: 1000, userAgent: USER_AGENT })

          await expect(client.loadRobots()).rejects.toBeInstanceOf(BlockedUrlError)
          expect(fetchMock).not.toHaveBeenCalled()
        },
      )
    })
  })
})
