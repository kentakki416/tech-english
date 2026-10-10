import { convertMdastToBlocks } from "../../../src/lib/document/convert-mdast-to-blocks"
import { parseMarkdown } from "../../../src/lib/document/parse-markdown"

const convertMarkdown = (source: string, isMdx = false) => convertMdastToBlocks(parseMarkdown(source, { isMdx }).root)

describe("convertMdastToBlocks", () => {
  describe("正常系", () => {
    it("インラインコードはバッククォートつきで残し、リンクはテキストだけ、強調は外す", () => {
      const blocks = convertMarkdown("Call `useState` from **the [hooks guide](https://example.com/hooks)** ~~today~~.\n")

      expect(blocks).toEqual([{ text: "Call `useState` from the hooks guide today.", type: "paragraph" }])
    })

    it("Hugo のショートコードを消し、ショートコードだけの段落は捨てる", () => {
      const blocks = convertMarkdown([
        "{{< note >}}",
        "",
        "Create a {{< glossary_tooltip text=\"Pod\" term_id=\"pod\" >}} before you {{% tab name=\"apply\" %}} the file.",
        "",
        "{{< /note >}}",
      ].join("\n"))

      expect(blocks).toEqual([{ text: "Create a before you the file.", type: "paragraph" }])
    })

    it("GitHub の注記マーカー（[!NOTE]）を消して quote にする", () => {
      const blocks = convertMarkdown("> [!NOTE]\n> Use the **latest** version.\n")

      expect(blocks).toEqual([{ text: "Use the latest version.", type: "quote" }])
    })

    it("引用の中の段落はつないで 1 つの quote にし、段落以外の子は再帰で変換する", () => {
      const blocks = convertMarkdown("> First line.\n>\n> Second line.\n>\n> - quoted item\n")

      expect(blocks).toEqual([
        { text: "First line. Second line.", type: "quote" },
        { text: "quoted item", type: "list_item" },
      ])
    })

    it("箇条書きの入れ子は 1 段に平坦化し、項目の中のコードは code ブロックにする", () => {
      const blocks = convertMarkdown([
        "- Parent item",
        "  - Child item",
        "    - Grandchild item",
        "- Item with code",
        "",
        "  ```bash",
        "  make build",
        "  ```",
        "",
        "  Text after the code.",
      ].join("\n"))

      expect(blocks).toEqual([
        { text: "Parent item", type: "list_item" },
        { text: "Child item", type: "list_item" },
        { text: "Grandchild item", type: "list_item" },
        { text: "Item with code", type: "list_item" },
        { lang: "bash", text: "make build", type: "code" },
        { text: "Text after the code.", type: "list_item" },
      ])
    })

    it("lang の無いコードは lang の key を持たず、空のコードは捨てる", () => {
      const blocks = convertMarkdown("```\nplain text\n```\n\n```js\n```\n")

      expect(blocks).toStrictEqual([{ text: "plain text", type: "code" }])
    })

    it("表・画像だけの段落・HTML・区切り線・脚注の定義を捨て、インラインの HTML はテキストだけ残す", () => {
      const blocks = convertMarkdown([
        "<div align=\"center\">Banner</div>",
        "",
        "![logo](/logo.png)",
        "",
        "| a | b |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "---",
        "",
        "Press <kbd>Ctrl</kbd> to continue.[^1]",
        "",
        "[^1]: A footnote.",
      ].join("\n"))

      expect(blocks).toEqual([{ text: "Press Ctrl to continue.", type: "paragraph" }])
    })

    it("改行は空白にし、空白の連続は 1 つにする", () => {
      const blocks = convertMarkdown("First   line  \nsecond line\nthird line\n")

      expect(blocks).toEqual([{ text: "First line second line third line", type: "paragraph" }])
    })

    it("MDX のインラインの JSX は子のテキストを残し、式は捨てる", () => {
      const blocks = convertMarkdown("Press <Kbd>Enter</Kbd> to save {props.name} now.\n", true)

      expect(blocks).toEqual([{ text: "Press Enter to save now.", type: "paragraph" }])
    })
  })

  describe("異常系", () => {
    it("空の文書は空配列", () => {
      expect(convertMarkdown("")).toEqual([])
    })
  })
})
