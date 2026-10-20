import { convertMdastToBlocks } from "../../src/document/convert-mdast-to-blocks"
import { parseHtml } from "../../src/document/parse-html"

import { readFixture } from "./helpers"

const GO_DOC_URL = "https://go.example.dev/doc/tidy"

describe("parseHtml", () => {
  describe("正常系", () => {
    it("go-doc.html：本文のセレクタの要素から nav / 除外セレクタ / aria-hidden を除き、language-go のコードを lang つきにする", () => {
      const { root, title } = parseHtml(readFixture("go-doc.html"), {
        contentSelector: "main article",
        excludeSelectors: [".feedback"],
        url: GO_DOC_URL,
      })

      expect(title).toBe("Writing Tidy Go Programs")
      expect(convertMdastToBlocks(root)).toEqual([
        { headingDepth: 1, text: "Writing Tidy Go Programs", type: "heading" },
        { text: "This page explains how to organize a small Go program. Read the modules guide first.", type: "paragraph" },
        { headingDepth: 2, text: "Packages", type: "heading" },
        { text: "Every Go file starts with a `package` clause.", type: "paragraph" },
        {
          lang: "go",
          text: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hello\")\n}",
          type: "code",
        },
        { text: "Keep package names short.", type: "list_item" },
        { text: "Avoid repeating the package name in exported names.", type: "list_item" },
        { text: "See also an external style guide, email us, open the menu, and the blog post.", type: "paragraph" },
      ])
    })

    it("links はページ全体の a[href] を絶対 URL にし、mailto: / javascript: を含まず、重複を除く", () => {
      const { links } = parseHtml(readFixture("go-doc.html"), {
        contentSelector: "main article",
        excludeSelectors: [],
        url: GO_DOC_URL,
      })

      expect(links).toEqual([
        "https://go.example.dev/",
        "https://go.example.dev/doc/",
        "https://go.example.dev/doc/tidy#packages",
        "https://go.example.dev/doc/modules",
        "https://style.example.org/guide",
        "https://go.example.dev/blog/tidy",
        "https://go.example.dev/privacy",
      ])
    })

    it("article-no-selector.html：セレクタが無ければ Readability で本文だけを取り出し、language-* のコードを lang つきにする", () => {
      const { root, title } = parseHtml(readFixture("article-no-selector.html"), {
        contentSelector: null,
        excludeSelectors: [],
        url: "https://docs.example.dev/docs/cache/edge",
      })

      expect(title).toBe("Caching Responses at the Edge")
      expect(convertMdastToBlocks(root)).toEqual([
        { headingDepth: 2, text: "How the cache decides", type: "heading" },
        {
          text: "When a request arrives, the edge server first looks for a stored copy of the response. If a fresh copy exists, the server returns it immediately, and the origin never sees the request. This keeps response times low, reduces the load on your servers, and makes traffic spikes much easier to handle.",
          type: "paragraph",
        },
        {
          text: "A stored copy stays fresh for the number of seconds given in the `max-age` directive. After that, the edge server asks the origin whether the copy is still valid, usually by sending the previous validator in a conditional request. If nothing has changed, the origin answers with a short status code, and the copy becomes fresh again without transferring the body.",
          type: "paragraph",
        },
        { text: "You can check the directives that a response carries by requesting only its headers:", type: "paragraph" },
        { lang: "sh", text: "curl -sI https://docs.example.dev/assets/app.css | grep -i cache-control", type: "code" },
        { headingDepth: 2, text: "Choosing what to cache", type: "heading" },
        {
          text: "Static files, such as images, fonts, and compiled scripts, are the easiest place to start, because their content rarely changes and their names often include a version. Pages that depend on the signed-in user, on the other hand, should not be stored in a shared cache, since one visitor could otherwise see the data of another.",
          type: "paragraph",
        },
        {
          text: "For everything in between, measure first. Look at which responses are requested most often, decide how stale each one may become, and set the directives to match. Small, careful steps usually work better than a single large change to every route.",
          type: "paragraph",
        },
      ])
    })

    it("Readability で取り出すときも除外セレクタに合う要素を取り除く", () => {
      const { root } = parseHtml(readFixture("article-no-selector.html"), {
        contentSelector: null,
        excludeSelectors: ["h2"],
        url: "https://docs.example.dev/docs/cache/edge",
      })

      const blocks = convertMdastToBlocks(root)
      expect(blocks.length).toBeGreaterThan(0)
      expect(blocks.filter((block) => block.type === "heading")).toEqual([])
    })

    it("js-rendered.html：本文が空なら空の mdast になり、script は実行されない", () => {
      const { links, root, title } = parseHtml(readFixture("js-rendered.html"), {
        contentSelector: null,
        excludeSelectors: [],
        url: "https://app.example.dev/docs",
      })

      expect(title).toBe("Dashboard Docs")
      expect(links).toEqual([])
      expect(convertMdastToBlocks(root)).toEqual([])
    })

    it("<title> が無ければ最初の h1 をタイトルにする", () => {
      const { title } = parseHtml("<main><h1>  Heading   Title </h1><p>Body.</p></main>", {
        contentSelector: "main",
        excludeSelectors: [],
        url: "https://docs.example.dev/",
      })

      expect(title).toBe("Heading Title")
    })

    it.each([
      ["表", "<table><tr><th>a</th></tr><tr><td>1</td></tr></table>"],
      ["リンクで包んだ画像", "<a href=\"/diagram.png\"><img src=\"/diagram.png\" alt=\"\"></a>"],
    ])("「:」で終わる段落の後ろの%sを捨てたら、末尾の「:」を「.」にする", (_, dropped) => {
      const { root } = parseHtml(
        `<main><p>For example:</p>${dropped}<p>Next.</p></main>`,
        { contentSelector: "main", excludeSelectors: [], url: "https://docs.example.dev/" },
      )

      expect(convertMdastToBlocks(root)).toEqual([
        { text: "For example.", type: "paragraph" },
        { text: "Next.", type: "paragraph" },
      ])
    })
  })

  describe("異常系", () => {
    it("本文のセレクタに合う要素が無ければ空の mdast になる（links は取れる）", () => {
      const { links, root } = parseHtml(readFixture("go-doc.html"), {
        contentSelector: "#does-not-exist",
        excludeSelectors: [],
        url: GO_DOC_URL,
      })

      expect(root.children).toEqual([])
      expect(links.length).toBeGreaterThan(0)
    })

    it("不正な本文のセレクタは throw する", () => {
      expect(() => parseHtml(readFixture("go-doc.html"), {
        contentSelector: "main[",
        excludeSelectors: [],
        url: GO_DOC_URL,
      })).toThrow()
    })

    it("不正な除外セレクタは throw する", () => {
      expect(() => parseHtml(readFixture("go-doc.html"), {
        contentSelector: null,
        excludeSelectors: ["[["],
        url: GO_DOC_URL,
      })).toThrow()
    })
  })
})
