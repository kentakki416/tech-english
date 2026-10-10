"use client"

import dynamic from "next/dynamic"

/**
 * Lottie アニメーションは DOM/Canvas に依存するため client でのみ描画する。
 * `dynamic(..., { ssr: false })` は Client Component 内でのみ許可されるため、
 * この島だけを "use client" に切り出し、ページ本体は Server Component に保つ。
 */
const DotLottieReact = dynamic(
  async () => import("@lottiefiles/dotlottie-react").then((mod) => mod.DotLottieReact),
  { ssr: false },
)

export function UserBotAnimation() {
  return (
    <div className="h-48 w-48">
      <DotLottieReact autoplay loop src="/kenttaki-bot.lottie" />
    </div>
  )
}
