import type { LookupAddress } from "node:dns"

import { BlockedUrlError, createSafeLookup, isBlockedAddress, isBlockedIpLiteral, type LookupAll } from "../../src/web"

/**
 * dns.lookup の偽物。決まったアドレスを返す
 */
const createLookup = (addresses: LookupAddress[], error: NodeJS.ErrnoException | null = null) =>
  vi.fn<LookupAll>((_hostname, _options, callback) => {
    callback(error, addresses)
  })

/**
 * createSafeLookup が callback に渡した引数を受け取る
 */
const runLookup = async (lookup: LookupAll, options: { all?: boolean }) =>
  new Promise<unknown[]>((resolve) => {
    createSafeLookup(lookup)("docs.example.com", options, (...args) => {
      resolve(args)
    })
  })

describe("isBlockedAddress", () => {
  describe("正常系", () => {
    it.each([
      ["10.0.0.1", 4],
      ["172.16.0.1", 4],
      ["172.31.255.255", 4],
      ["192.168.1.1", 4],
      ["127.0.0.1", 4],
      ["169.254.169.254", 4],
      ["0.0.0.0", 4],
      ["::1", 6],
      ["::", 6],
      ["fe80::1", 6],
      ["fd12::1", 6],
      ["::ffff:127.0.0.1", 6],
      ["::ffff:7f00:1", 6],
      ["::ffff:a9fe:a9fe", 6],
    ])("%s は弾く", (address, family) => {
      expect(isBlockedAddress(address, family)).toBe(true)
    })

    it.each([
      ["8.8.8.8", 4],
      ["172.32.0.1", 4],
      ["2001:4860:4860::8888", 6],
      ["::ffff:8.8.8.8", 6],
    ])("%s は弾かない", (address, family) => {
      expect(isBlockedAddress(address, family)).toBe(false)
    })
  })
})

describe("isBlockedIpLiteral", () => {
  describe("正常系", () => {
    it.each([
      ["127.0.0.1", true],
      ["[::1]", true],
      ["[::ffff:7f00:1]", true],
      ["169.254.169.254", true],
      ["8.8.8.8", false],
      ["go.dev", false],
      ["localhost", false],
    ])("%s → %s（ホスト名は lookup で検査するので false）", (hostname, expected) => {
      expect(isBlockedIpLiteral(hostname)).toBe(expected)
    })
  })
})

describe("createSafeLookup", () => {
  describe("正常系", () => {
    it("公開アドレスだけなら all: true の指定どおり配列で返し、lookup には常に all: true で問い合わせる", async () => {
      const addresses = [{ address: "93.184.216.34", family: 4 }, { address: "2606:2800:220:1::1", family: 6 }]
      const lookup = createLookup(addresses)

      const args = await runLookup(lookup, { all: true })

      expect(args).toEqual([null, addresses])
      expect(lookup).toHaveBeenCalledWith("docs.example.com", { all: true }, expect.any(Function))
    })

    it("all の指定が無ければ先頭のアドレスと family を返す", async () => {
      const lookup = createLookup([{ address: "93.184.216.34", family: 4 }, { address: "93.184.216.35", family: 4 }])

      const args = await runLookup(lookup, {})

      expect(args).toEqual([null, "93.184.216.34", 4])
      expect(lookup).toHaveBeenCalledWith("docs.example.com", { all: true }, expect.any(Function))
    })
  })

  describe("異常系", () => {
    it("解決結果に 1 つでもプライベートのアドレスがあれば BlockedUrlError（DNS rebinding 対策）", async () => {
      const lookup = createLookup([{ address: "93.184.216.34", family: 4 }, { address: "169.254.169.254", family: 4 }])

      const [error] = await runLookup(lookup, { all: true })

      expect(error).toBeInstanceOf(BlockedUrlError)
    })

    it("IPv4 射影の IPv6 アドレスも弾く", async () => {
      const [error] = await runLookup(createLookup([{ address: "::ffff:10.0.0.5", family: 6 }]), { all: true })

      expect(error).toBeInstanceOf(BlockedUrlError)
    })

    it("解決結果が空なら BlockedUrlError", async () => {
      const [error] = await runLookup(createLookup([]), { all: true })

      expect(error).toBeInstanceOf(BlockedUrlError)
    })

    it("名前解決のエラーはそのまま返す", async () => {
      const notFound = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })

      const [error] = await runLookup(createLookup([], notFound), { all: true })

      expect(error).toBe(notFound)
    })
  })
})
