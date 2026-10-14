import path from "node:path"

import picomatch from "picomatch"

export type PathFilter = {
  excludeGlobs: string[]
  includeGlobs: string[]
}

/**
 * 対象パス（include）のどれかに合い、除外パス（exclude）のどれにも合わないパスかどうか。
 * GitHub はリポジトリ内のファイルパス、サイトは URL のパスを渡す
 */
export const isTargetPath = (targetPath: string, { excludeGlobs, includeGlobs }: PathFilter): boolean => {
  if (includeGlobs.length === 0) return false
  if (!picomatch(includeGlobs)(targetPath)) return false
  return excludeGlobs.length === 0 || !picomatch(excludeGlobs)(targetPath)
}

/**
 * パスが base の中（base 自身を含む）にあるか。base が空文字ならルートなので常に true
 */
const isInsideDirectory = (targetPath: string, base: string): boolean =>
  base === "" || targetPath === base || targetPath.startsWith(`${base}/`)

/**
 * glob の固定部分のディレクトリ（`src/content/learn/` 以下の glob なら `src/content/learn`。picomatch.scan の base）。
 * glob 文字を含まないファイルパス（`docs/intro.md`）は、そのファイルがあるディレクトリにする。ルートなら空文字
 */
const findGlobBaseDirectory = (glob: string): string => {
  const { base, isGlob } = picomatch.scan(glob)
  const directory = isGlob ? base : path.posix.dirname(base)
  return directory === "." ? "" : directory.replace(/\/+$/, "")
}

/**
 * glob ごとの固定部分のディレクトリを、入れ子の重複を除いて昇順で返す。
 * GitHub の trees API が切り詰められたとき、このディレクトリごとに取り直す。ルート（空文字）を含むなら `[""]`
 */
export const findGlobBaseDirectories = (globs: string[]): string[] => {
  const directories = [...new Set(globs.map(findGlobBaseDirectory))].sort()
  return directories.filter(
    (directory) => !directories.some((other) => other !== directory && isInsideDirectory(directory, other)),
  )
}
