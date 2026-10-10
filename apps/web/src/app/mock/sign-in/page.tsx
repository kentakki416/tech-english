import { Wordmark } from "../_components/Wordmark"

import { SignInDemo } from "./SignInDemo"

/**
 * ログイン画面（モック）
 */
export default function MockSignInPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Wordmark href="/mock/sign-in" />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <h1 className="text-[32px] leading-[1.4] font-semibold tracking-tight text-fg sm:text-[38px]">
            <span className="inline-block">公式ドキュメントの</span>
            <span className="inline-block">英語で、</span>
            <span className="inline-block">毎日 1 問。</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-[1.9] text-fg-muted">
            GitHub の README や公式ドキュメントの実際の英文を読んで、4 択の設問に答える長文読解です。わからない単語はその場で意味を確かめられます。
          </p>
          <a
            className="mt-8 inline-flex h-12 items-center gap-3 rounded-lg bg-fg px-5 text-[15px] font-semibold text-canvas outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            href="/mock/home"
          >
            <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub でログイン
          </a>
          <p className="mt-3 text-xs text-fg-faint">初回はアカウントが自動で作られます。GitHub のリポジトリにはアクセスしません。</p>
        </div>
        <SignInDemo />
      </main>
    </div>
  )
}
