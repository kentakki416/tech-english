const VARIABLE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/**
 * view の SQL の `${NAME}` を置き換える。
 *
 * 未定義の変数はエラーにする。置き換え漏れのまま ClickHouse に送ると、
 * 構文エラーで止まらずに別の識別子として解釈されうるため。
 */
export const renderViewSql = (template: string, variables: Record<string, string>): string =>
  template.replace(VARIABLE_PATTERN, (_, name: string) => {
    const value = variables[name]
    if (value === undefined) {
      throw new Error(`undefined variable in view sql: ${name}`)
    }
    return value
  })
