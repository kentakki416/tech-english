import Image from "next/image"

import AvatarText from "@/components/ui/avatar/AvatarText"

/**
 * 表の行（40px）・ヘッダー（44px）・詳細の上段（80px）の大きさ
 */
const AVATAR_SIZES = {
  lg: { className: "size-20", pixels: 80 },
  md: { className: "size-11", pixels: 44 },
  sm: { className: "size-10", pixels: 40 },
} as const

type Props = {
  avatarUrl: string | null
  name: string | null
  size: keyof typeof AVATAR_SIZES
}

/**
 * 人のアイコン（ユーザー・admin）。画像が無ければ名前の頭文字を出す。
 * 画像は Google などの外部の URL なので、最適化せずにそのまま読む（next.config の remotePatterns を増やさない）。
 * referrer を送ると Google のアイコンは弾かれることがあるので送らない
 */
export default function UserAvatar({ avatarUrl, name, size }: Props) {
  const { className, pixels } = AVATAR_SIZES[size]
  if (avatarUrl) {
    return (
      <div className={`shrink-0 overflow-hidden rounded-full ${className}`}>
        <Image
          unoptimized
          alt={name ?? ""}
          className="h-full w-full object-cover"
          height={pixels}
          referrerPolicy="no-referrer"
          src={avatarUrl}
          width={pixels}
        />
      </div>
    )
  }
  return <AvatarText className={`shrink-0 ${className}`} name={name ?? ""} />
}
