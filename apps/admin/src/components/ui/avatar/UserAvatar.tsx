import Image from "next/image"

import AvatarText from "@/components/ui/avatar/AvatarText"

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

export default function UserAvatar({ avatarUrl, name, size }: Props) {
  const { className, pixels } = AVATAR_SIZES[size]
  if (avatarUrl) {
    return (
      <div className={`shrink-0 overflow-hidden rounded-full ${className}`}>
        {/**
         * 画像は Google などの外部の URL なので、最適化せずにそのまま読む（next.config の remotePatterns を増やさない）。
         * referrer を送ると Google のアイコンは弾かれることがあるので送らない
         */}
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
