"use client"

import {
  arrow,
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
} from "@floating-ui/react"
import React, { cloneElement, useState } from "react"

type TooltipPlacement = "top" | "right" | "bottom" | "left"

/**
 * TailAdmin のデモの 4 種類。default は白、dark は黒、plain は矢印なしの黒、no-arrow は矢印なしの白
 */
type TooltipVariant = "default" | "dark" | "plain" | "no-arrow"

type TooltipProps = {
  /**
   * トリガー。ref と hover / focus の props を付けるので、DOM 要素（button / a / span など）を渡す。
   * フォーカスできない要素なら tabIndex={0} を付ける（キーボードでも出せるように）
   */
  children: React.ReactElement<Record<string, unknown>>
  /** 吹き出しの中身 */
  content: React.ReactNode
  placement?: TooltipPlacement
  variant?: TooltipVariant
}

/**
 * 吹き出しの色と枠（TailAdmin のデモの実測値）
 */
const BUBBLE_VARIANT_CLASSES: Record<TooltipVariant, string> = {
  dark: "border bg-gray-950 text-white border-gray-800 dark:bg-gray-800 dark:border-gray-700",
  default: "border bg-white text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700",
  "no-arrow": "bg-white text-gray-700 dark:bg-gray-900 dark:text-white",
  plain: "bg-gray-800 text-white dark:bg-gray-900",
}

/**
 * 矢印の背景と枠の色。矢印は default と dark だけに付く。
 * ダークの default の矢印（#1E2634）は吹き出し（gray-900）より明るいが、デモに合わせている
 */
const ARROW_COLOR_CLASSES: Record<"dark" | "default", string> = {
  dark: "bg-gray-950 dark:bg-gray-800 border-gray-800 dark:border-gray-700",
  default: "bg-white dark:bg-[#1E2634] border-gray-200 dark:border-gray-700",
}

/**
 * 45° 回した正方形のうち、吹き出しの外に出る 2 辺にだけ枠を付ける
 */
const ARROW_SIDE_CLASSES: Record<TooltipPlacement, string> = {
  bottom: "border-l border-t",
  left: "border-r border-t",
  right: "border-l border-b",
  top: "border-r border-b",
}

/**
 * 矢印を吹き出しの外に 6px（12px 角の半分）出す向き。placement の反対側
 */
const ARROW_OUTER_SIDE: Record<TooltipPlacement, "bottom" | "left" | "right" | "top"> = {
  bottom: "top",
  left: "right",
  right: "left",
  top: "bottom",
}

/**
 * マウスを乗せる・フォーカスすると説明の吹き出しを出す。見た目と動きは TailAdmin のデモと同じ。
 * 吹き出しは body の直下に出すので、overflow: hidden の親（表の枠など）の中でも切れない
 */
export default function Tooltip({
  children,
  content,
  placement = "top",
  variant = "default",
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  /**
   * 矢印の要素は ref ではなく state で持つ（描画中に ref を読まないよう、React Compiler の規則に合わせる）
   */
  const [arrowElement, setArrowElement] = useState<HTMLDivElement | null>(null)
  const hasArrow = variant === "default" || variant === "dark"

  const {
    context,
    floatingStyles,
    middlewareData,
    placement: resolvedPlacement,
    refs: { setFloating, setReference },
  } = useFloating({
    middleware: [
      offset(10),
      flip({ fallbackAxisSideDirection: "start" }),
      shift({ padding: 8 }),
      arrow({ element: arrowElement, padding: 8 }),
    ],
    onOpenChange: setIsOpen,
    open: isOpen,
    placement,
    whileElementsMounted: autoUpdate,
  })

  const { getFloatingProps, getReferenceProps } = useInteractions([
    useHover(context),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: "tooltip" }),
  ])

  /**
   * トリガーに呼び出し側が付けた ref があれば、floating-ui の ref とまとめて付ける（上書きして消さない）
   */
  const triggerRef = useMergeRefs([setReference, children.props.ref as React.Ref<Element> | undefined])

  /**
   * flip で反対側に出たときは、矢印の辺と位置も実際の placement で決める
   */
  const side = resolvedPlacement.split("-")[0] as TooltipPlacement
  const arrowX = middlewareData.arrow?.x
  const arrowY = middlewareData.arrow?.y

  return (
    <>
      {cloneElement(children, getReferenceProps({ ...children.props, ref: triggerRef }))}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={setFloating}
            className={`z-99999 w-max max-w-xs rounded-lg px-3.5 py-2 text-xs font-medium shadow-md ${BUBBLE_VARIANT_CLASSES[variant]}`}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {content}
            {hasArrow && (
              <div
                ref={setArrowElement}
                className={`absolute h-3 w-3 rotate-45 ${ARROW_COLOR_CLASSES[variant === "dark" ? "dark" : "default"]} ${ARROW_SIDE_CLASSES[side]}`}
                style={{
                  left: arrowX !== undefined ? `${arrowX}px` : "",
                  top: arrowY !== undefined ? `${arrowY}px` : "",
                  [ARROW_OUTER_SIDE[side]]: "-6px",
                }}
              />
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
