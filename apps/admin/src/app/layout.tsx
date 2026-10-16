import type { Metadata } from "next"
import { Outfit } from "next/font/google"

import "./globals.css"
import { appConfig } from "@/config/app"
import { SidebarProvider } from "@/features/sidebar/sidebar.context"
import { ThemeProvider } from "@/features/theme/theme.context"

/**
 * Outfit は欧文だけなので、日本語は globals.css の --font-outfit で Hiragino Sans / Noto Sans JP に落とす。
 * --font-outfit は @theme で :root に出るので、この変数も <html> に付ける（<body> だと :root から見えず、--font-outfit ごと無効になる）
 */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit-loaded",
})

export const metadata: Metadata = {
  description: appConfig.description,
  icons: { icon: "/favicon.svg" },
  title: {
    default: appConfig.name,
    template: `%s | ${appConfig.name}`,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={outfit.variable} lang={appConfig.lang}>
      <body className="dark:bg-gray-900">
        <ThemeProvider>
          <SidebarProvider>{children}</SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
