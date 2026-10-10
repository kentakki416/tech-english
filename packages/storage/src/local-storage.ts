import { promises as fs } from "node:fs"
import { dirname, isAbsolute, join, relative } from "node:path"

import type { Storage } from "./storage"

/**
 * ローカル filesystem 実装。`baseDir` 直下に保存し、`publicUrlPrefix` 経由で配信させる。
 * 書き込み側と配信側が同じ filesystem を共有できるローカル開発向け
 * （本番の別コンテナ構成では S3Storage を使う）。
 */
export class LocalStorage implements Storage {
  constructor(
    private readonly _baseDir: string,
    private readonly _publicUrlPrefix: string,
  ) {}

  public async save(key: string, body: Buffer): Promise<string> {
    const fullPath = this._resolveSafePath(key)
    /**
     * key にサブディレクトリ (例: "special-badges/123-hof.png") が含まれる場合、
     * 親ディレクトリも含めて mkdir -p しないと writeFile が ENOENT で失敗する。
     */
    await fs.mkdir(dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, body)
    return `${this._publicUrlPrefix}/${key}`
  }

  public async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this._resolveSafePath(key))
    } catch (err) {
      /**
       * ファイルが既に無い場合は無視 (二重削除等)
       */
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
  }

  /**
   * key を baseDir 配下の絶対パスへ解決する。`../` や絶対パスで baseDir の外へ
   * 出るような key（path traversal）は拒否する。storage は generic で key の
   * 出所を限定しないため、呼び出し側由来の値が混入しても安全側に倒す。
   */
  private _resolveSafePath(key: string): string {
    const fullPath = join(this._baseDir, key)
    const rel = relative(this._baseDir, fullPath)
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`Invalid storage key (path traversal detected): ${key}`)
    }
    return fullPath
  }
}
