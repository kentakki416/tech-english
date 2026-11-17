import express from "express"

import { admins, users } from "@repo/db"
import { Admin, User } from "@repo/domain"

import { generateAdminAccessToken } from "../../src/lib/admin-jwt"
import { generateAccessToken } from "../../src/lib/jwt"
import { authMiddleware } from "../../src/middleware/auth"
import { unhandledExceptionHandler } from "../../src/middleware/unhandled-exception-handler"

import { testDb } from "./setup"

export const createTestApp = (): express.Express => {
  const app = express()
  app.use(express.json())
  app.use(authMiddleware)
  return app
}

/**
 * Express のエラーハンドラはルートの後に登録する必要があるので、ルートを登録してから呼ぶ
 */
export const attachUnhandledExceptionHandler = (app: express.Express): void => {
  app.use(unhandledExceptionHandler)
}

export const createTestUser = async (overrides?: {
  avatarUrl?: string
  email?: string
  name?: string
}): Promise<{ token: string; user: User }> => {
  const [row] = await testDb
    .insert(users)
    .values({
      avatarUrl: overrides?.avatarUrl ?? "https://example.com/avatar.jpg",
      email: overrides?.email ?? `test-${Date.now()}@example.com`,
      name: overrides?.name ?? "Test User",
    })
    .returning()

  const user: User = {
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    email: row.email,
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    updatedAt: row.updatedAt,
  }

  const token = generateAccessToken(user.id)

  return { token, user }
}

export const createTestAdmin = async (overrides?: {
  email?: string
  name?: string
}): Promise<{ admin: Admin; token: string }> => {
  const [row] = await testDb
    .insert(admins)
    .values({
      email: overrides?.email ?? `admin-${Date.now()}@example.com`,
      name: overrides?.name ?? "Test Admin",
    })
    .returning()

  const admin: Admin = {
    id: row.id,
    avatarUrl: row.avatarUrl,
    email: row.email,
    lastSignedInAt: row.lastSignedInAt,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }

  return { admin, token: generateAdminAccessToken(admin.id) }
}
