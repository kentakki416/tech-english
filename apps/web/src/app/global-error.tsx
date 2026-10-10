"use client"

/**
 * root layout 自体が落ちたときのフォールバック。
 * root layout を置き換えるため globals.css / フォントが効かない前提で、
 * スタイルは self-contained（インライン）にする。<html>/<body> を自前で持つ必要がある。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ja">
      <body
        style={{
          alignItems: "center",
          background: "#fafafa",
          color: "#171717",
          display: "flex",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100dvh",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center", width: "100%" }}>
          <p style={{ color: "#ef4444", fontSize: "48px", fontWeight: 700, margin: 0 }}>
            500
          </p>
          <h1 style={{ fontSize: "20px", fontWeight: 600, marginTop: "12px" }}>
            サーバーエラーが発生しました
          </h1>
          <p style={{ color: "#52525b", fontSize: "14px", lineHeight: 1.7, marginTop: "8px" }}>
            問題が発生してページを読み込めませんでした。少し時間をおいて再度お試しください。
          </p>
          {error.digest ? (
            <p style={{ color: "#a1a1aa", fontSize: "12px", marginTop: "12px" }}>
              エラーID: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              background: "#18181b",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
              marginTop: "24px",
              padding: "10px 20px",
            }}
            type="button"
          >
            再読み込み
          </button>
        </div>
      </body>
    </html>
  )
}
