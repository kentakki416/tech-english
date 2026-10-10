import { convertMdastToBlocks } from "../../../src/lib/document/convert-mdast-to-blocks"
import { parseMarkdown } from "../../../src/lib/document/parse-markdown"

import { readFixture } from "./helpers"

describe("parseMarkdown", () => {
  describe("正常系", () => {
    it("guide.mdx：frontmatter の title を使い、import 文・JSX・表・画像を捨て、lang つきのコードと入れ子のリストを残す", () => {
      const { root, title } = parseMarkdown(readFixture("guide.mdx"), { isMdx: true })

      expect(title).toBe("Keeping Component State Small")
      expect(convertMdastToBlocks(root)).toEqual([
        { headingDepth: 1, text: "Managing State", type: "heading" },
        {
          text: "State lets a component remember information between renders. When you call `setCount`, the component renders again with the new value.",
          type: "paragraph",
        },
        { headingDepth: 2, text: "Choosing the state structure", type: "heading" },
        { text: "Keep the state as small as you can. You can read more in the state guide.", type: "paragraph" },
        { text: "Group related state together", type: "list_item" },
        { text: "Avoid redundant state", type: "list_item" },
        { text: "Avoid duplicated state", type: "list_item" },
        { text: "Avoid deeply nested state", type: "list_item" },
        { text: "Install the helper package:", type: "list_item" },
        { lang: "sh", text: "npm install tiny-state", type: "code" },
        { lang: "js", text: "const [count, setCount] = useState(0)", type: "code" },
      ])
    })

    it("book.md：frontmatter が無ければ最初の h1 をタイトルにし、h2 / h3 / h4 の見出しを深さつきで残す", () => {
      const { root, title } = parseMarkdown(readFixture("book.md"), { isMdx: false })

      expect(title).toBe("Borrowing Without Fear")
      expect(convertMdastToBlocks(root)).toEqual([
        { headingDepth: 1, text: "Borrowing Without Fear", type: "heading" },
        {
          text: "This chapter explains how a program can lend a value to a function without giving it away.",
          type: "paragraph",
        },
        { headingDepth: 2, text: "What Is Borrowing?", type: "heading" },
        {
          text: "A borrow is a temporary view of a value. The owner keeps the value, and the borrower must give it back before the owner changes it.",
          type: "paragraph",
        },
        { headingDepth: 3, text: "Shared and Exclusive Borrows", type: "heading" },
        {
          text: "Many readers can look at a value at the same time, but only one writer can change it.",
          type: "paragraph",
        },
        { headingDepth: 4, text: "A Small Example", type: "heading" },
        { text: "The compiler checks every borrow before the program runs.", type: "paragraph" },
        {
          lang: "rust",
          text: "let name = String::from(\"Ferris\");\nlet length = measure(&name);",
          type: "code",
        },
        { headingDepth: 2, text: "Common Mistakes", type: "heading" },
        {
          text: "Returning a borrow of a local value is a frequent mistake, because the value disappears when the function ends.",
          type: "paragraph",
        },
      ])
    })

    it("frontmatter の title が文字列でなければ最初の h1 をタイトルにする", () => {
      const { title } = parseMarkdown("---\ntitle: 42\n---\n\n## Second\n\n# First Heading\n", { isMdx: false })

      expect(title).toBe("First Heading")
    })

    it("TOML の frontmatter は本文にせず、タイトルは h1 から取る", () => {
      const { root, title } = parseMarkdown("+++\ntitle = \"Toml Title\"\n+++\n\n# Heading Title\n\nBody text.\n", { isMdx: false })

      expect(title).toBe("Heading Title")
      expect(convertMdastToBlocks(root)).toEqual([
        { headingDepth: 1, text: "Heading Title", type: "heading" },
        { text: "Body text.", type: "paragraph" },
      ])
    })

    it("frontmatter の title も h1 も無ければ null", () => {
      const { title } = parseMarkdown("## Only a Subheading\n\nBody text.\n", { isMdx: false })

      expect(title).toBeNull()
    })
  })

  describe("異常系", () => {
    it("壊れた .mdx は throw する", () => {
      const source = "# Title\n\n<Sandpack>\n\nThe component is never closed.\n"

      expect(() => parseMarkdown(source, { isMdx: true })).toThrow()
    })

    it("同じ内容でも .md として読めば throw しない", () => {
      const source = "# Title\n\n<Sandpack>\n\nThe component is never closed.\n"

      expect(() => parseMarkdown(source, { isMdx: false })).not.toThrow()
    })

    it("壊れた YAML の frontmatter は throw せず、最初の h1 をタイトルにする", () => {
      const source = "---\ntitle: [this list is never closed\n---\n\n# Fallback Title\n\nBody text.\n"

      const { title } = parseMarkdown(source, { isMdx: false })

      expect(title).toBe("Fallback Title")
    })
  })
})
