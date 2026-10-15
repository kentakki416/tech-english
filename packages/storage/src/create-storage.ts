import { LocalStorage } from "./local-storage"
import { S3Storage } from "./s3-storage"
import type { Storage } from "./storage"

/**
 * 新しいバックエンド（GCS 等）は Storage を実装し、この union を増やすだけで追加できる。
 */
export type StorageConfig =
  | {
    baseDir: string
    publicUrlPrefix: string
    type: "local"
  }
  | {
    bucket: string
    /**
     * 保存するオブジェクトの Cache-Control。省略時は "public, max-age=86400"
     */
    cacheControl?: string
    publicUrlBase: string
    region?: string
    type: "s3"
  }

/**
 * config.type に応じて Storage 実装を選択する factory（strategy）。
 */
export const createStorage = (config: StorageConfig): Storage => {
  switch (config.type) {
  case "s3":
    return new S3Storage(config.bucket, config.publicUrlBase, config.region, config.cacheControl)
  case "local":
    return new LocalStorage(config.baseDir, config.publicUrlPrefix)
  }
}
