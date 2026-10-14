"use client"

import { useSyncExternalStore } from "react"

/**
 * 購読する変化は無い（hydration の前後を見分けるためだけに useSyncExternalStore を使う）
 */
const subscribeNothing = () => () => undefined

/**
 * hydration 中（とサーバー）は false、その後は true。localStorage など端末にしか無いものを読んでよいかの判定に使う。
 * クライアントの遷移で初めて描画されるときは最初から true
 */
export const useIsClient = (): boolean => useSyncExternalStore(subscribeNothing, () => true, () => false)
