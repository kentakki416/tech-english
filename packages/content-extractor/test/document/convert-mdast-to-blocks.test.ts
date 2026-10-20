import { convertMdastToBlocks } from "../../src/document/convert-mdast-to-blocks"
import { parseMarkdown } from "../../src/document/parse-markdown"

const convertMarkdown = (source: string, isMdx = false) => convertMdastToBlocks(parseMarkdown(source, { isMdx }).root)

describe("convertMdastToBlocks", () => {
  describe("正常系", () => {
    it("インラインコードはバッククォートつきで残し、リンクはテキストだけ、強調は外す", () => {
      const blocks = convertMarkdown("Call `useState` from **the [hooks guide](https://example.com/hooks)** ~~today~~.\n")

      expect(blocks).toEqual([{ text: "Call `useState` from the hooks guide today.", type: "paragraph" }])
    })

    it("Hugo のショートコードを消し、glossary_tooltip は text の語に置き換え、ショートコードだけの段落は捨てる", () => {
      const blocks = convertMarkdown([
        "{{< note >}}",
        "",
        "Create a {{< glossary_tooltip text=\"Pod\" term_id=\"pod\" >}} before you {{% tab name=\"apply\" %}} apply the file.",
        "",
        "{{< /note >}}",
      ].join("\n"))

      expect(blocks).toEqual([{ text: "Create a Pod before you apply the file.", type: "paragraph" }])
    })

    it("glossary_tooltip は引数の順序・改行によらず text に置き換え、text が無ければ term_id にする", () => {
      const blocks = convertMarkdown([
        "The {{< glossary_tooltip term_id=\"kube-scheduler\" text=\"scheduler\" >}} assigns Pods to",
        "{{< glossary_tooltip text=\"nodes\"",
        "term_id=\"node\" >}}, and the {{< glossary_tooltip term_id=\"kubelet\" >}} runs them.",
      ].join("\n"))

      expect(blocks).toEqual([{ text: "The scheduler assigns Pods to nodes, and the kubelet runs them.", type: "paragraph" }])
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

    it("「:」で終わる段落の後ろの <Sandpack> を捨てたら、末尾の「:」を「.」にする", () => {
      const blocks = convertMarkdown([
        "Here is the result:",
        "",
        "<Sandpack>",
        "",
        "```js",
        "const a = 1",
        "```",
        "",
        "</Sandpack>",
        "",
        "Next paragraph.",
      ].join("\n"), true)

      expect(blocks).toEqual([
        { text: "Here is the result.", type: "paragraph" },
        { text: "Next paragraph.", type: "paragraph" },
      ])
    })

    it.each([
      ["表", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
      ["画像だけの段落", "![diagram](/diagram.png)"],
      ["HTML", "<div>Banner</div>"],
      ["リンクで包んだ画像の段落", "[![diagram](/diagram.png)](/diagram.png)"],
    ])("「:」で終わる段落の後ろの%sを捨てたら「.」にする", (_, dropped) => {
      const blocks = convertMarkdown(`For example:\n\n${dropped}\n\nNext.\n`)

      expect(blocks).toEqual([
        { text: "For example.", type: "paragraph" },
        { text: "Next.", type: "paragraph" },
      ])
    })

    it("文書の最後の「:」で終わる段落は「.」にする", () => {
      expect(convertMarkdown("Run this command:\n")).toEqual([{ text: "Run this command.", type: "paragraph" }])
    })

    it("末尾の絵文字のショートコードの「:」は変えない", () => {
      expect(convertMarkdown("Happy hacking :rocket:\n")).toEqual([{ text: "Happy hacking :rocket:", type: "paragraph" }])
    })

    it.each([
      ["コード", "```sh\nnpm install\n```"],
      ["箇条書き", "* one"],
      ["引用", "> quoted"],
      ["段落", "Second paragraph."],
      ["見出し", "## Next step"],
      ["ショートコードだけの段落とコード", "{{< tabs >}}\n\n```yaml\nkind: Pod\n```"],
      ["区切り線とコード", "---\n\n```yaml\nkind: Pod\n```"],
      ["HTML のコメントとコード", "<!-- generated -->\n\n```yaml\nkind: Pod\n```"],
      ["囲みのタグだけの HTML とコード", "<div class=\"tabs\">\n\n```yaml\nkind: Pod\n```\n\n</div>"],
    ])("「:」で終わる段落の後ろに%sが続けば「:」のまま", (_, next) => {
      const blocks = convertMarkdown(`Apply the manifest:\n\n${next}\n`)

      expect(blocks[0]).toEqual({ text: "Apply the manifest:", type: "paragraph" })
    })

    it("<Note> の中の「:」で終わる段落も、後ろの <Sandpack> を捨てたら「.」にする", () => {
      const blocks = convertMarkdown([
        "<Note>",
        "",
        "Try this:",
        "",
        "<Sandpack>",
        "",
        "```js",
        "const a = 1",
        "```",
        "",
        "</Sandpack>",
        "",
        "</Note>",
      ].join("\n"), true)

      expect(blocks).toEqual([{ text: "Try this.", type: "paragraph" }])
    })

    it("箇条書きの項目の末尾の「:」と、末尾が「:」でない段落は、後ろの <Sandpack> を捨てても変えない", () => {
      const blocks = convertMarkdown([
        "* Try this:",
        "",
        "<Sandpack>",
        "",
        "```js",
        "const a = 1",
        "```",
        "",
        "</Sandpack>",
        "",
        "Here is the result.",
        "",
        "<Sandpack>",
        "",
        "```js",
        "const a = 1",
        "```",
        "",
        "</Sandpack>",
      ].join("\n"), true)

      expect(blocks).toEqual([
        { text: "Try this:", type: "list_item" },
        { text: "Here is the result.", type: "paragraph" },
      ])
    })
  })

  describe("異常系", () => {
    it("空の文書は空配列", () => {
      expect(convertMarkdown("")).toEqual([])
    })
  })
})
