import Link from "next/link"

/**
 * ロゴ。学習した日を表す「灯ったマス」をブランドの印にする
 */
export function Wordmark({ href = "/mock/home" }: { href?: string }) {
  return (
    <Link
      className="group inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
      href={href}
    >
      <span
        aria-hidden
        className="size-3 rounded-[3px] bg-amber shadow-[0_0_12px_rgb(243_178_76/0.55)] transition-shadow group-hover:shadow-[0_0_18px_rgb(243_178_76/0.8)]"
      />
      <span className="font-code text-[15px] font-medium tracking-tight text-fg">tech-english</span>
    </Link>
  )
}
