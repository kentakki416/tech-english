import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import { User } from "@repo/domain"

import type { TransactionContext } from "../transaction"
import type { CreateUserInput, UpdateUserProfileInput, UserRepository } from "../user-repository"

import { resolvePrismaClient } from "./transaction-runner"

/**
 * Prisma実装のユーザーリポジトリ
 */
export class PrismaUserRepository implements UserRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findById(id: number): Promise<User | null> {
    const prismaUser = await this._prisma.user.findUnique({ where: { id } })
    if (!prismaUser) return null
    return this._toDomainUser(prismaUser)
  }

  public async findByEmail(email: string): Promise<User | null> {
    const prismaUser = await this._prisma.user.findUnique({ where: { email } })
    if (!prismaUser) return null
    return this._toDomainUser(prismaUser)
  }

  public async create(data: CreateUserInput, tx?: TransactionContext): Promise<User> {
    const client = resolvePrismaClient(this._prisma, tx)
    const prismaUser = await client.user.create({
      data: {
        avatarUrl: data.avatarUrl,
        email: data.email,
        name: data.name,
        timezone: data.timezone,
      },
    })
    return this._toDomainUser(prismaUser)
  }

  public async updateProfile(id: number, data: UpdateUserProfileInput): Promise<User> {
    const prismaUser = await this._prisma.user.update({
      data: {
        avatarUrl: data.avatarUrl,
        name: data.name,
      },
      where: { id },
    })
    return this._toDomainUser(prismaUser)
  }

  public async updateTimezone(id: number, timezone: string): Promise<User> {
    const prismaUser = await this._prisma.user.update({
      data: { timezone },
      where: { id },
    })
    return this._toDomainUser(prismaUser)
  }

  /**
   * 関連テーブル（auth_accounts など）は DB の ON DELETE CASCADE で消える
   */
  public async deleteById(id: number): Promise<void> {
    await this._prisma.user.deleteMany({ where: { id } })
  }

  /**
   * Prismaの型 → ドメインの型に変換
   */
  private _toDomainUser(prismaUser: PrismaTypes.UserGetPayload<{}>): User {
    return {
      avatarUrl: prismaUser.avatarUrl,
      createdAt: prismaUser.createdAt,
      email: prismaUser.email,
      id: prismaUser.id,
      name: prismaUser.name,
      timezone: prismaUser.timezone,
      updatedAt: prismaUser.updatedAt,
    }
  }
}
