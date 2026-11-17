/* eslint-disable no-console */
import { MIGRATIONS_DIR } from "./paths"
import { runDrizzleKit } from "./run-drizzle-kit"
import { moveOnlineStatements } from "./split-online-statements"

/**
 * db:generate: drizzle-kit generate の後に、トランザクションの外で流す文を online.sql に移す
 */
const main = async (): Promise<void> => {
  await runDrizzleKit("generate", process.argv.slice(2))
  const changedFolderNames = await moveOnlineStatements(MIGRATIONS_DIR)
  for (const folderName of changedFolderNames) {
    console.log(`Moved online statements to ${folderName}/online.sql`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
