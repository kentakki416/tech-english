"use client"

import Tooltip from "@/components/ui/tooltip/Tooltip"
import { InfoIcon } from "@/icons"

/**
 * Tooltip は子の props を読んで cloneElement するので、子を client component の中で作る。
 * Server Component で作った子は RSC の lazy の要素で届くことがあり（子に InfoIcon のような component を含むと起きた）、props が無く落ちる
 */
export function LoginMethodColumnLabel() {
  return (
    <Tooltip content="ユーザーが紐付けているログイン方法（GitHub・Google・dev）">
      <span className="inline-flex items-center gap-1" tabIndex={0}>
        ログイン方法
        {/**
         * SVGR が viewBox を消すので、小さく描くときは viewBox を渡す（渡さないと切れる）
         */}
        <InfoIcon className="size-4" viewBox="0 0 24 24" />
      </span>
    </Tooltip>
  )
}
