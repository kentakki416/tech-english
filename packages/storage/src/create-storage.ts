import { LocalStorage } from "./local-storage"
import { S3Storage } from "./s3-storage"
import type { Storage } from "./storage"

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

export const createStorage = (config: StorageConfig): Storage => {
  switch (config.type) {
  case "s3":
    return new S3Storage(config.bucket, config.publicUrlBase, config.region, config.cacheControl)
  case "local":
    return new LocalStorage(config.baseDir, config.publicUrlPrefix)
  }
}
