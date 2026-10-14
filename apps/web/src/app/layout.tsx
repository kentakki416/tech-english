import "./globals.css"

import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans_JP, Literata } from "next/font/google"

import { EventFlushOnHide } from "@/components/ui/EventFlushOnHide"

/**
 * 本文（英文）の書体。globals.css の `--font-reading` が参照する
 */
const literata = Literata({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-literata",
})

/**
 * UI の書体。日本語のサブセットは大きいため preload しない。globals.css の `--font-ui` が参照する
 */
const plexSansJp = IBM_Plex_Sans_JP({
  display: "swap",
  preload: false,
  variable: "--font-plex-sans-jp",
  weight: ["400", "500", "600", "700"],
})

/**
 * コードの書体。globals.css の `--font-code` が参照する
 */
const plexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: "tech-english",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body
        className={`${literata.variable} ${plexSansJp.variable} ${plexMono.variable} app-backdrop min-h-dvh bg-canvas font-ui text-fg antialiased [color-scheme:dark] selection:bg-amber/30`}
      >
        <EventFlushOnHide />
        {children}
      </body>
    </html>
  )
}
