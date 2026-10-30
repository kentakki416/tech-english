"use client"

import Tooltip from "@/components/ui/tooltip/Tooltip"
import { InfoIcon } from "@/icons"

export function SourceListTitle({ tooltips }: { tooltips: { label: string, text: string }[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      ソース一覧
      {tooltips.map(({ label, text }) => (
        <Tooltip key={label} content={text} placement="bottom">
          <span className="inline-flex items-center gap-1 text-theme-xs font-normal text-gray-500 dark:text-gray-400" tabIndex={0}>
            <InfoIcon className="size-4" viewBox="0 0 24 24" />
            {label}
          </span>
        </Tooltip>
      ))}
    </span>
  )
}
