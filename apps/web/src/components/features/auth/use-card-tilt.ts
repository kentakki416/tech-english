"use client"

import { type RefObject, useEffect, useRef } from "react"

/**
 * 傾きの最大の角度（度）。カードの端にマウスを置いたときにこの角度になる
 */
const MAX_TILT_DEG = 6

const isReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches

const clampToUnit = (value: number): number => Math.min(Math.max(value, 0), 1)

/**
 * 傾きをやめる。子は data-tilting で傾きと光を切り替えるので、CSS の transition で平らに戻る
 */
const resetTilt = (element: HTMLElement) => {
  element.dataset.tilting = "false"
}

/**
 * マウスの動きでカードを傾ける。返す ref を付けた要素（傾けない枠）に、傾きと光の位置を書き込む
 *
 * - `data-tilting`: マウスで傾けている間は "true"。子は group-data で傾き・光を切り替える
 * - `--tilt-rotate-x` / `--tilt-rotate-y`: 傾き（deg）。カーソルのある側が奥に沈む向き
 * - `--tilt-glare-x` / `--tilt-glare-y`: 光の中心（%）
 *
 * 角度は傾けない枠の位置から求める。傾けたカード自身の位置で求めると、傾くたびに位置が変わって揺れるため。
 * React の state は使わずに DOM に直接書き、requestAnimationFrame で 1 フレーム 1 回にまとめる（マウスが動くたびに描き直さない）。
 * タッチ（マウス以外）と「視差効果を減らす」では傾けない。
 * isPaused の間は今の角度のまま止める（単語のカードを開いている間。傾きで単語が動くと、押した位置に出したカードとずれるため）
 */
export function useCardTilt<T extends HTMLElement>(isPaused: boolean): RefObject<T | null> {
  const ref = useRef<T>(null)
  const isPausedRef = useRef(isPaused)
  const isPointerInsideRef = useRef(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let frameId: number | null = null
    let pointer: { clientX: number, clientY: number } | null = null

    const writeTilt = () => {
      frameId = null
      if (!pointer || isPausedRef.current) return
      const rect = element.getBoundingClientRect()
      const x = clampToUnit((pointer.clientX - rect.left) / rect.width)
      const y = clampToUnit((pointer.clientY - rect.top) / rect.height)
      element.style.setProperty("--tilt-rotate-x", `${((0.5 - y) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
      element.style.setProperty("--tilt-rotate-y", `${((x - 0.5) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
      element.style.setProperty("--tilt-glare-x", `${(x * 100).toFixed(1)}%`)
      element.style.setProperty("--tilt-glare-y", `${(y * 100).toFixed(1)}%`)
      element.dataset.tilting = "true"
    }

    const moveTilt = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || isReducedMotion()) return
      isPointerInsideRef.current = true
      pointer = { clientX: event.clientX, clientY: event.clientY }
      if (frameId === null) frameId = requestAnimationFrame(writeTilt)
    }

    const leaveTilt = () => {
      isPointerInsideRef.current = false
      if (isPausedRef.current) return
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = null
      resetTilt(element)
    }

    element.addEventListener("pointermove", moveTilt)
    element.addEventListener("pointerleave", leaveTilt)
    return () => {
      element.removeEventListener("pointermove", moveTilt)
      element.removeEventListener("pointerleave", leaveTilt)
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [])

  /**
   * 止めている間にマウスが外れていたら、再開したときに平らに戻す（外れたときの pointerleave は止めている間に来て捨てている）
   */
  useEffect(() => {
    isPausedRef.current = isPaused
    if (!isPaused && !isPointerInsideRef.current && ref.current) resetTilt(ref.current)
  }, [isPaused])

  return ref
}
