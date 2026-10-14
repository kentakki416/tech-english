/**
 * デザインモック用のトークン（web の `globals.css` の @theme と同じ値）
 *
 * 日本語の UI は OS の標準書体を使い、英文（Literata）とコード（IBM Plex Mono）だけフォントを同梱する。
 */

export const MOCK_COLORS = {
  amber: "#f3b24c",
  amberBright: "#ffca72",
  amberInk: "#2a1c05",
  amberWash: "rgba(243, 178, 76, 0.12)",
  canvas: "#12161f",
  codeComment: "#6d778d",
  codeFn: "#90c6f0",
  codeKeyword: "#d3a8f2",
  codeString: "#a9d5a1",
  correct: "#6fcaa3",
  correctWash: "rgba(111, 202, 163, 0.12)",
  fg: "#dde2ea",
  fgFaint: "#647086",
  fgMuted: "#949db1",
  heat0: "#1d2331",
  heat1: "#3b3122",
  heat2: "#67502a",
  heat3: "#a57a32",
  heat4: "#f3b24c",
  /**
   * 単語帳の紙のカードの文字（墨色）。web の `--color-ink*` と同じ値
   */
  ink: "#2b261f",
  inkAmber: "#94600f",
  inkFaint: "#998c76",
  inkMuted: "#6b6152",
  line: "#29303f",
  lineStrong: "#3a4356",
  /**
   * 単語帳の紙のカード（生成り）。web の `--color-paper*` と同じ値
   */
  paper: "#f2e8d5",
  paperDeep: "#e9dcc3",
  paperEdge: "#d8c9ac",
  raised: "#202736",
  surface: "#181d28",
  wrong: "#f08c8c",
  wrongWash: "rgba(240, 140, 140, 0.12)",
} as const

export const MOCK_HEAT_COLORS = [MOCK_COLORS.heat0, MOCK_COLORS.heat1, MOCK_COLORS.heat2, MOCK_COLORS.heat3, MOCK_COLORS.heat4]

export const MOCK_FONTS = {
  code: "IBMPlexMono_400Regular",
  codeMedium: "IBMPlexMono_500Medium",
  reading: "Literata_400Regular",
  readingSemiBold: "Literata_600SemiBold",
} as const
