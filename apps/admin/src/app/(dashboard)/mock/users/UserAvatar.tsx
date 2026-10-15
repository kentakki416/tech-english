import Image from "next/image"

/**
 * ユーザーのアイコン。画像が無ければ名前の頭文字（絵文字なども 1 文字として扱う。名前が無い・空なら「?」）を丸に出す
 */
export function UserAvatar({ avatarUrl, name, size }: { avatarUrl: string | null, name: string | null, size: number }) {
  if (avatarUrl) {
    return <Image alt="" className="shrink-0 rounded-full object-cover" height={size} src={avatarUrl} width={size} />
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-600 uppercase dark:bg-brand-500/20 dark:text-brand-400"
      style={{ fontSize: size * 0.4, height: size, width: size }}
    >
      {Array.from(name ?? "")[0] ?? "?"}
    </span>
  )
}
