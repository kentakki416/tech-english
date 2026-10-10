import { LocalStorage } from "./local-storage"
import { S3Storage } from "./s3-storage"
import type { Storage } from "./storage"

/**
 * ストレージ選択の設定（strategy のキー）。
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
    publicUrlBase: string
    region?: string
    type: "s3"
  }

/**
 * config.type に応じて Storage 実装を選択する factory（strategy）。
 * 利用側（worker / api）は env からこの config を組み立てて呼ぶだけでよい。
 */
export const createStorage = (config: StorageConfig): Storage => {
  switch (config.type) {
  case "s3":
    return new S3Storage(config.bucket, config.publicUrlBase, config.region)
  case "local":
    return new LocalStorage(config.baseDir, config.publicUrlPrefix)
  }
}
