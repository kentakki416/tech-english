import dns from "node:dns"
import { BlockList, isIP, type LookupFunction } from "node:net"

import { BlockedUrlError } from "./errors"

/**
 * 接続しないアドレスの範囲。プライベート・ループバック・リンクローカル（EC2 / ECS のメタデータ 169.254.169.254 を含む）と
 * 「このホスト」の 0.0.0.0/8、IPv6 の同等範囲（::、::1、ユニークローカル fc00::/7、リンクローカル fe80::/10）
 */
const blockList = new BlockList()
blockList.addSubnet("0.0.0.0", 8, "ipv4")
blockList.addSubnet("10.0.0.0", 8, "ipv4")
blockList.addSubnet("127.0.0.0", 8, "ipv4")
blockList.addSubnet("169.254.0.0", 16, "ipv4")
blockList.addSubnet("172.16.0.0", 12, "ipv4")
blockList.addSubnet("192.168.0.0", 16, "ipv4")
blockList.addAddress("::", "ipv6")
blockList.addAddress("::1", "ipv6")
blockList.addSubnet("fc00::", 7, "ipv6")
blockList.addSubnet("fe80::", 10, "ipv6")

const MAPPED_DOTTED_PATTERN = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i

const MAPPED_HEX_PATTERN = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i

/**
 * IPv4 射影アドレス（`::ffff:127.0.0.1`、URL が正規化した `::ffff:7f00:1`）を IPv4 にする。射影アドレスでなければ null
 */
const convertMappedAddressToIpv4 = (address: string): string | null => {
  const dotted = MAPPED_DOTTED_PATTERN.exec(address)?.[1]
  if (dotted) return dotted
  const hex = MAPPED_HEX_PATTERN.exec(address)
  if (!hex) return null
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
}

/**
 * 接続してはいけないアドレスか。family は dns.lookup の値（4 / 6）
 */
export const isBlockedAddress = (address: string, family: number): boolean => {
  const mapped = convertMappedAddressToIpv4(address)
  if (mapped) return blockList.check(mapped, "ipv4")
  return blockList.check(address, family === 6 ? "ipv6" : "ipv4")
}

/**
 * URL のホストが IP アドレスそのもので、接続してはいけない範囲か。
 * IP アドレスのホストには net.connect が lookup を呼ばない（createSafeLookup を通らない）ので、リクエストの前にこれで弾く
 */
export const isBlockedIpLiteral = (hostname: string): boolean => {
  /**
   * URL の hostname は IPv6 を [] で囲む
   */
  const address = hostname.replace(/^\[(.*)\]$/, "$1")
  const family = isIP(address)
  return family !== 0 && isBlockedAddress(address, family)
}

/**
 * 名前解決した全アドレスを返す lookup（dns.lookup の `all: true`）
 */
export type LookupAll = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void

const lookupAllWithDns: LookupAll = (hostname, options, callback) => {
  dns.lookup(hostname, options, callback)
}

/**
 * net.connect の lookup と同じシグネチャの、接続してはいけないアドレスを弾く lookup。
 * undici の Agent の connect.lookup に渡し、**接続のときに** 名前解決した全アドレスを検査する
 * （事前に解決してから fetch すると、その間に DNS の応答が変わる DNS rebinding を防げないため）。
 * 解決結果に 1 つでも弾くアドレスがあれば BlockedUrlError で失敗させる。lookup はテストで差し替える
 */
export const createSafeLookup = (lookup: LookupAll = lookupAllWithDns): LookupFunction => (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0)
    if (addresses.length === 0 || addresses.some((item) => isBlockedAddress(item.address, item.family))) {
      return callback(new BlockedUrlError(hostname), "", 0)
    }
    return options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family)
  })
}
