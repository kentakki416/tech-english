import { Literata } from "next/font/google"

const literata = Literata({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-literata",
})

/**
 * 問題の画面のレイアウト
 *
 * 問題のプレビューをユーザー画面と同じ書体（Literata）で表示するため、ここでフォントを読み込む。
 */
export default function PassagesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={literata.variable} lang="ja">{children}</div>
}
