import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans_JP, Literata } from "next/font/google"

const literata = Literata({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-literata",
})

const plexSansJp = IBM_Plex_Sans_JP({
  display: "swap",
  preload: false,
  variable: "--font-plex-sans-jp",
  weight: ["400", "500", "600", "700"],
})

const plexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  description: "tech-english のデザインモック",
  title: "tech-english モック",
}

/**
 * デザインモック共通のレイアウト
 *
 * ルートレイアウトの Geist / ライトテーマの影響を受けないよう、ここでフォントと背景を当てる。
 */
export default function MockLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div
      className={`${literata.variable} ${plexSansJp.variable} ${plexMono.variable} app-backdrop min-h-dvh bg-canvas font-ui text-fg antialiased [color-scheme:dark] selection:bg-amber/30`}
      lang="ja"
    >
      {children}
    </div>
  )
}
