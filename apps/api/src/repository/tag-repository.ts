import type { Tag, TagColor } from "@repo/domain"

export type TagInput = Pick<Tag, "color" | "name">

/**
 * sourceCount はこのタグを付けているソースの数
 */
export type TagWithSourceCount = Tag & { sourceCount: number }

/**
 * lower(name) の unique 制約に違反したら duplicate（大文字・小文字だけが違う名前を含む）
 */
export type TagSaveResult = { kind: "duplicate" } | { kind: "saved"; tag: Tag }

export interface TagRepository {
  create(input: TagInput): Promise<TagSaveResult>
  /**
   * 消せたら true、無ければ false。紐付いた source_tags は CASCADE で消える
   */
  delete(id: number): Promise<boolean>
  /**
   * 名前の順（lower(name)）。同じなら id の順
   */
  findAll(): Promise<TagWithSourceCount[]>
  /**
   * 渡した id のうち存在するものだけ（順不同）。空の配列なら空の配列
   */
  findByIds(ids: number[]): Promise<Tag[]>
  /**
   * 全タグの色（重複あり）
   */
  findColors(): Promise<TagColor[]>
  /**
   * 無ければ not_found
   */
  update(id: number, input: TagInput): Promise<TagSaveResult | { kind: "not_found" }>
}
