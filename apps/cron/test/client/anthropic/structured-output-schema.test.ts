import { z } from "zod/v4"

import { convertZodToStructuredOutputSchema } from "../../../src/client/anthropic"

describe("convertZodToStructuredOutputSchema", () => {
  describe("正常系", () => {
    it("文字数・数値の範囲・配列の長さを落とし、型・enum・const・description を残す", () => {
      const schema = z.object({
        count: z.number().int().min(0).max(3).describe("How many"),
        kind: z.enum(["a", "b"]),
        name: z.string().min(1).max(20),
        tags: z.array(z.string()).length(4),
        version: z.literal("v1"),
      })

      expect(convertZodToStructuredOutputSchema(schema)).toEqual({
        additionalProperties: false,
        properties: {
          count: { description: "How many", type: "integer" },
          kind: { enum: ["a", "b"], type: "string" },
          name: { type: "string" },
          tags: { items: { type: "string" }, type: "array" },
          version: { const: "v1", type: "string" },
        },
        required: ["count", "kind", "name", "tags", "version"],
        type: "object",
      })
    })

    it("配列の minItems は 0 と 1 だけ残す", () => {
      const schema = z.object({
        many: z.array(z.string()).min(2),
        nonEmpty: z.array(z.string()).min(1),
      })

      const converted = convertZodToStructuredOutputSchema(schema) as { properties: Record<string, unknown> }

      expect(converted.properties.many).toEqual({ items: { type: "string" }, type: "array" })
      expect(converted.properties.nonEmpty).toEqual({ items: { type: "string" }, minItems: 1, type: "array" })
    })

    it("nullable は null との anyOf にし、入れ子のオブジェクトにも additionalProperties: false を付ける", () => {
      const schema = z.object({ target: z.object({ index: z.number().int() }).nullable() })

      expect(convertZodToStructuredOutputSchema(schema)).toEqual({
        additionalProperties: false,
        properties: {
          target: {
            anyOf: [
              { additionalProperties: false, properties: { index: { type: "integer" } }, required: ["index"], type: "object" },
              { type: "null" },
            ],
          },
        },
        required: ["target"],
        type: "object",
      })
    })

    it("受け付ける文字列の format は残し、それ以外の format と pattern は落とす", () => {
      const schema = z.object({
        at: z.iso.datetime(),
        code: z.string().regex(/^[A-Z]+$/),
        site: z.url(),
      })

      const converted = convertZodToStructuredOutputSchema(schema) as { properties: Record<string, unknown> }

      expect(converted.properties.at).toEqual({ format: "date-time", type: "string" })
      expect(converted.properties.code).toEqual({ type: "string" })
      expect(converted.properties.site).toEqual({ format: "uri", type: "string" })
    })

    it("optional のキーは required に入れない", () => {
      const schema = z.object({ note: z.string().optional(), title: z.string() })

      expect(convertZodToStructuredOutputSchema(schema)).toMatchObject({ required: ["title"] })
    })
  })

  describe("異常系", () => {
    it("intersection（allOf）は変換できないので throw する", () => {
      const schema = z.object({ value: z.intersection(z.object({ a: z.string() }), z.object({ b: z.string() })) })

      expect(() => convertZodToStructuredOutputSchema(schema)).toThrow("Unsupported JSON Schema keyword for structured output: allOf at $.value")
    })

    it("ルートがオブジェクトでなければ throw する", () => {
      expect(() => convertZodToStructuredOutputSchema(z.array(z.string()))).toThrow("Structured output schema must be an object")
    })
  })
})
