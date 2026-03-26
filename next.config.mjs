import nextra from "nextra"

const withNextra = nextra({
  search: { codeblocks: false },
  whiteListTagsStyling: ["table", "thead", "tbody", "tr", "th", "td"]
})

export default withNextra({
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      "next-mdx-import-source-file": "./mdx-components.js"
    }
  }
})
