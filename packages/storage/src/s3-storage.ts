import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

import type { Storage } from "./storage"

/**
 * key の拡張子から ContentType を推定する（generic に保つため用途を固定しない）。
 * 未知の拡張子は undefined を返し、S3 既定（binary/octet-stream）に委ねる。
 */
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
}

const inferContentType = (key: string): string | undefined => {
  const ext = key.split(".").pop()?.toLowerCase() ?? ""
  return CONTENT_TYPE_BY_EXT[ext]
}

/**
 * S3 実装。公開読み取りバケットに PutObject し公開 URL を返す。
 * 書き込み側と配信側が filesystem を共有できない本番（別コンテナ）向け。
 */
export class S3Storage implements Storage {
  private readonly _client: S3Client
  private readonly _bucket: string
  private readonly _publicUrlBase: string

  constructor(bucket: string, publicUrlBase: string, region?: string) {
    this._client = new S3Client(region ? { region } : {})
    this._bucket = bucket
    /**
     * 末尾スラッシュを除いて key と二重スラッシュにならないようにする
     */
    this._publicUrlBase = publicUrlBase.replace(/\/+$/, "")
  }

  public async save(key: string, body: Buffer): Promise<string> {
    await this._client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this._bucket,
        CacheControl: "public, max-age=86400",
        ContentType: inferContentType(key),
        Key: key,
      }),
    )
    return `${this._publicUrlBase}/${key}`
  }

  public async delete(key: string): Promise<void> {
    await this._client.send(new DeleteObjectCommand({ Bucket: this._bucket, Key: key }))
  }
}
