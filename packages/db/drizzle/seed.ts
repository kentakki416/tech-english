/* eslint-disable no-console */
import { createDrizzleClient } from "../src/drizzle/client"
import { admins, authAccounts, users } from "../src/drizzle/schema"

const db = createDrizzleClient()

/**
 * dev-login で使う開発用ユーザー
 *
 * `/api/auth/dev-login` および web の sign-in 画面の「Login as alice/bob」
 * ボタン経由でログインできる。production 環境では seed 自体スキップする。
 */
type DevUserSeed = {
  email: string
  name: string
}

const devUsers: DevUserSeed[] = [
  { email: "alice@dev.local", name: "Alice (dev)" },
  { email: "bob@dev.local", name: "Bob (dev)" },
]

const seedDevUsers = async () => {
  for (const devUser of devUsers) {
    const [user] = await db
      .insert(users)
      .values({ email: devUser.email, name: devUser.name })
      .onConflictDoUpdate({
        set: { name: devUser.name, updatedAt: new Date() },
        target: users.email,
      })
      .returning()
    if (!user) throw new Error(`Failed to upsert dev user: ${devUser.email}`)

    /**
     * AuthAccount(provider: "dev") を upsert して
     * Google アカウントと衝突しない形で dev ユーザーを識別できるようにする
     */
    await db
      .insert(authAccounts)
      .values({ provider: "dev", providerAccountId: devUser.email, userId: user.id })
      .onConflictDoNothing({ target: [authAccounts.provider, authAccounts.providerAccountId] })
    console.log(`Seeded dev user: ${devUser.email} (id=${user.id})`)
  }
}

/**
 * admin の dev ログインで使う開発用の admin
 */
const DEV_ADMIN_EMAIL = "admin@dev.local"

const seedDevAdmin = async () => {
  await db
    .insert(admins)
    .values({ email: DEV_ADMIN_EMAIL, name: "Admin (dev)" })
    .onConflictDoNothing({ target: admins.email })
  console.log(`Seeded dev admin: ${DEV_ADMIN_EMAIL}`)
}

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    console.log("Skip seeding: NODE_ENV=production")
    return
  }
  await seedDevUsers()
  await seedDevAdmin()
  console.log("Seed completed (PostgreSQL)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
