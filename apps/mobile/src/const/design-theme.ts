/**
 * 本番の画面で使うデザイントークン（web の `globals.css` の @theme と同じ値）
 *
 * 日本語の UI は OS の標準書体を使い、英文（Literata）とコード（IBM Plex Mono）だけフォントを同梱する。
 * フォントはルートレイアウト（`src/app/_layout.tsx`）で読み込む。
 */

export const THEME_COLORS = {
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
  line: "#29303f",
  lineStrong: "#3a4356",
  raised: "#202736",
  surface: "#181d28",
  wrong: "#f08c8c",
  wrongWash: "rgba(240, 140, 140, 0.12)",
} as const

export const HEAT_COLORS = [THEME_COLORS.heat0, THEME_COLORS.heat1, THEME_COLORS.heat2, THEME_COLORS.heat3, THEME_COLORS.heat4]

export const THEME_FONTS = {
  code: "IBMPlexMono_400Regular",
  codeMedium: "IBMPlexMono_500Medium",
  reading: "Literata_400Regular",
  readingSemiBold: "Literata_600SemiBold",
} as const
