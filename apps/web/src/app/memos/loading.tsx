/**
 * /memos配下の読み込み中に自動で表示される
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="h-8 w-40 animate-pulse rounded bg-zinc-200" />
      <div className="mt-4 space-y-3">
        {[0,1,2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-100" />
        ))}
      </div>

    </main>
  )
}