"use client"

import React from "react"

import Tooltip from "@/components/ui/tooltip/Tooltip"

/**
 * TailAdmin のデモ（https://demo.tailadmin.com/tooltips ）と同じ構成の見本
 */
const TRIGGER_CLASS_NAME = "bg-brand-500 shadow-theme-xs inline-flex rounded-lg px-4 py-3 text-sm font-medium text-white"

function ExampleCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      <div className="px-6 py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">{title}</h3>
      </div>
      <div className="border-t border-gray-100 p-6 dark:border-gray-800">{children}</div>
    </div>
  )
}

export default function TooltipExample() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
      <ExampleCard title="Default Tooltip">
        <div className="flex flex-wrap gap-4">
          <Tooltip content="This is a tooltip">
            <button className={TRIGGER_CLASS_NAME} type="button">Default Tooltip</button>
          </Tooltip>
        </div>
      </ExampleCard>

      <ExampleCard title="White and Dark Tooltip">
        <div className="flex items-center gap-10">
          <Tooltip content="This is a tooltip">
            <button className={TRIGGER_CLASS_NAME} type="button">White Tooltip</button>
          </Tooltip>
          <Tooltip content="This is a tooltip" variant="dark">
            <button className={TRIGGER_CLASS_NAME} type="button">Dark Tooltip Top</button>
          </Tooltip>
        </div>
      </ExampleCard>

      <ExampleCard title="Tooltip Placement">
        <div className="flex flex-col items-center gap-10 sm:flex-row">
          <Tooltip content="This is a tooltip" placement="top">
            <button className={TRIGGER_CLASS_NAME} type="button">Tooltip Top</button>
          </Tooltip>
          <Tooltip content="Dark variant tooltip" placement="right">
            <button className={TRIGGER_CLASS_NAME} type="button">Tooltip Right</button>
          </Tooltip>
          <Tooltip content="Tooltip on bottom" placement="bottom">
            <button className={TRIGGER_CLASS_NAME} type="button">Tooltip Bottom</button>
          </Tooltip>
          <Tooltip content="Tooltip on left side" placement="left">
            <button className={TRIGGER_CLASS_NAME} type="button">Tooltip Left</button>
          </Tooltip>
        </div>
      </ExampleCard>

      <ExampleCard title="Tooltip Without Arrow Dark">
        <div className="flex flex-col items-center gap-10 sm:flex-row">
          {(["top", "right", "bottom", "left"] as const).map((placement) => (
            <Tooltip content="This is a tooltip" key={placement} placement={placement} variant="plain">
              <button className={TRIGGER_CLASS_NAME} type="button">
                Tooltip {placement.charAt(0).toUpperCase() + placement.slice(1)}
              </button>
            </Tooltip>
          ))}
        </div>
      </ExampleCard>

      <ExampleCard title="Tooltip Without Arrow White">
        <div className="flex flex-col items-center gap-10 sm:flex-row">
          {(["top", "right", "bottom", "left"] as const).map((placement) => (
            <Tooltip content="This is a tooltip" key={placement} placement={placement} variant="no-arrow">
              <button className={TRIGGER_CLASS_NAME} type="button">
                Tooltip {placement.charAt(0).toUpperCase() + placement.slice(1)}
              </button>
            </Tooltip>
          ))}
        </div>
      </ExampleCard>
    </div>
  )
}
