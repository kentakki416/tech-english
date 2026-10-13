import { PrimaryActions } from "./PrimaryActions"

/**
 * まだ 1 問も解いていないときの案内。上段の導線のボタンはここに移す
 */
export function FirstStepGuide() {
  return (
    <section className="mt-8 rounded-xl border border-amber/30 bg-amber-wash px-6 py-8 sm:px-8">
      <h2 className="text-lg font-semibold text-fg">最初の 1 問を解いてみましょう</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
        公式ドキュメントや GitHub の英文を読んで、4 択の設問に答えます。1 問 5〜10 分ほどです。解くと、今日のマスに色が付きます。
      </p>
      <div className="mt-5"><PrimaryActions /></div>
    </section>
  )
}
