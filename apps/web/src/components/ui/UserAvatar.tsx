import Image from "next/image"

/**
 * GitHub のアバター。avatar_url が無ければ名前の頭文字（名前も無ければ空の丸）。
 * 表示の大きさは className の size-* で、size（px）は画像の取得サイズ
 */
export function UserAvatar({
  avatarUrl,
  className,
  name,
  size,
}: {
  avatarUrl: string | null
  className: string
  name: string | null
  size: number
}) {
  const label = name ?? "ユーザー"
  if (avatarUrl) {
    return (
      <Image
        alt={label}
        className={`shrink-0 rounded-full border border-line-strong bg-raised ${className}`}
        height={size}
        src={avatarUrl}
        width={size}
      />
    )
  }
  return (
    <span
      aria-label={label}
      className={`grid shrink-0 place-items-center rounded-full border border-line-strong bg-raised font-semibold text-fg ${className}`}
      role="img"
    >
      {name?.charAt(0).toUpperCase() ?? ""}
    </span>
  )
}
