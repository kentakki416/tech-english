import { twMerge } from "tailwind-merge"

interface AvatarTextProps {
  name: string;
  className?: string;
}

export default function AvatarText({ name, className = "" }: AvatarTextProps) {
  /**
   * 単語ごとの最初の文字（記号は飛ばす。「Admin (dev)」は「AD」）。文字が取れなければ「?」
   */
  const initials = Array.from(
    name
      .split(/\s+/)
      .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
      .join("")
      .toUpperCase(),
  ).slice(0, 2).join("") || "?"

  /**
   * 名前から決まる淡い色（同じ名前なら同じ色）
   */
  const getColorClass = (name: string) => {
    const colors = [
      "bg-brand-100 text-brand-600",
      "bg-pink-100 text-pink-600",
      "bg-cyan-100 text-cyan-600",
      "bg-orange-100 text-orange-600",
      "bg-green-100 text-green-600",
      "bg-purple-100 text-purple-600",
      "bg-yellow-100 text-yellow-600",
      "bg-error-100 text-error-600",
    ]

    const index = name
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[index % colors.length]
  }

  return (
    <div
      className={twMerge(
        "flex h-10 w-10 items-center justify-center rounded-full",
        getColorClass(name),
        className,
      )}
    >
      <span className="text-sm font-medium">{initials}</span>
    </div>
  )
}
