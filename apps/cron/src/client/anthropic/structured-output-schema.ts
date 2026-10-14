import { z } from "zod/v4"

/**
 * JSON Schema の 1 ノード
 */
type JsonSchemaNode = { [key: string]: unknown }

/**
 * structured output が受け付ける文字列の format
 */
const SUPPORTED_STRING_FORMATS = new Set([
  "date",
  "date-time",
  "duration",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "time",
  "uri",
  "uuid",
])

/**
 * 変換できないキーワード。zod の union の一部（discriminatedUnion 以外）・intersection・再帰の参照で出る。
 * 黙って捨てると出力の形の制約が緩むので throw する
 */
const UNSUPPORTED_COMBINATOR_KEYWORDS = ["$ref", "allOf", "not", "oneOf"]

const isJsonSchemaNode = (value: unknown): value is JsonSchemaNode =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * 1 ノードを、structured output が受け付けるキーワードだけを残したノードにする（再帰）
 */
const convertNode = (node: JsonSchemaNode, path: string): JsonSchemaNode => {
  const combinator = UNSUPPORTED_COMBINATOR_KEYWORDS.find((keyword) => keyword in node)
  if (combinator) throw new Error(`Unsupported JSON Schema keyword for structured output: ${combinator} at ${path}`)

  const converted: JsonSchemaNode = {}
  if (Array.isArray(node.anyOf)) {
    converted.anyOf = node.anyOf.map((variant, index) => {
      if (!isJsonSchemaNode(variant)) throw new Error(`Invalid anyOf variant at ${path}.anyOf.${index}`)
      return convertNode(variant, `${path}.anyOf.${index}`)
    })
  }
  if (node.type !== undefined) converted.type = node.type
  if (typeof node.description === "string") converted.description = node.description
  if (Array.isArray(node.enum)) converted.enum = node.enum
  if (node.const !== undefined) converted.const = node.const

  if (node.type === "object") {
    const properties = isJsonSchemaNode(node.properties) ? node.properties : {}
    converted.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        if (!isJsonSchemaNode(value)) throw new Error(`Invalid property schema at ${path}.${key}`)
        return [key, convertNode(value, `${path}.${key}`)]
      }),
    )
    converted.required = Array.isArray(node.required) ? node.required : []
    converted.additionalProperties = false
  }
  if (node.type === "array") {
    if (isJsonSchemaNode(node.items)) converted.items = convertNode(node.items, `${path}[]`)
    if (node.minItems === 0 || node.minItems === 1) converted.minItems = node.minItems
  }
  if (node.type === "string" && typeof node.format === "string" && SUPPORTED_STRING_FORMATS.has(node.format)) {
    converted.format = node.format
  }
  return converted
}

/**
 * Zod のスキーマ（zod/v4）から、Claude API の structured output（`output_config.format`）に渡す JSON Schema を作る。
 *
 * API は文字数・数値の範囲・配列の長さ（`minItems` の 0 / 1 以外）を受け付けず、渡すと 400 になるので、
 * 受け付けるキーワード（type / properties / required / items / anyOf / enum / const / description / 一部の format）だけを残す。
 * 落とした制約は出力で守られる保証が無いので、**最終的な正しさは必ず呼び出し側が同じ Zod で検証する**。
 *
 * SDK の `zodOutputFormat` は `enum` / `const` も description に移して制約から外すため使わない
 * （設問の種類・難易度を enum で強制したい）。refine / superRefine は JSON Schema に表せないので、
 * refine を付ける前のオブジェクトのスキーマを渡す。
 *
 * キーの順序を揺らさないよう、モジュールの読み込み時に 1 回だけ呼んで定数にする（プロンプトキャッシュとスキーマのコンパイルのキャッシュのため）
 */
export const convertZodToStructuredOutputSchema = (schema: z.ZodType): Record<string, unknown> => {
  const jsonSchema = z.toJSONSchema(schema, { io: "output", unrepresentable: "throw" })
  if (jsonSchema.type !== "object") throw new Error("Structured output schema must be an object")
  return convertNode(jsonSchema, "$")
}
