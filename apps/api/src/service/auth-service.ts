import { User } from "@repo/domain"
import { err, notFoundError, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { type IGitHubOAuthClient } from "../client/github-oauth"
import { type IGoogleOAuthClient, GoogleUserInfo } from "../client/google-oauth"
import {
  AuthAccountRepository,
  RefreshTokenRepository,
  type TransactionRunner,
  UserRepository,
} from "../repository"

export type AuthenticateWithGoogleSuccess = {
  accessToken: string
  isNewUser: boolean
  refreshToken: string
  user: User
}

type Repositories = {
  authAccountRepository: AuthAccountRepository
  refreshTokenRepository: RefreshTokenRepository
  transactionRunner: TransactionRunner
  userRepository: UserRepository
}

export type TokenGenerators = {
  generateAccessToken: (userId: number) => string
  generateRefreshToken: (userId: number) => { jti: string; token: string }
}

export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

/**
 * Access Token / Refresh Token を発行し、Refresh Token の jti を保存する
 */
const issueTokens = async (
  userId: number,
  repo: { refreshTokenRepository: RefreshTokenRepository },
  tokenGenerators: TokenGenerators
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessToken = tokenGenerators.generateAccessToken(userId)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(userId)
  await repo.refreshTokenRepository.save(jti, userId, REFRESH_TTL_SECONDS)

  logger.debug("AuthService: Tokens issued", { userId })

  return { accessToken, refreshToken }
}

/**
 * Google アカウントでの認証
 *
 * Next.js 側で取得した Authorization Code を Google で検証し、UserInfo を取得する。
 * 既存ユーザーが居なければ User + AuthAccount を作成し、Access/Refresh Token を発行する。
 *
 * 業務エラー（現状なし）は Result.err として返し、外部サービス障害などの予期しないエラーは throw する。
 */
export const authenticateWithGoogle = async (
  input: { code: string; redirectUri: string },
  repo: Repositories,
  googleAuthClient: IGoogleOAuthClient,
  tokenGenerators: TokenGenerators
): Promise<Result<AuthenticateWithGoogleSuccess>> => {
  logger.info("AuthService: Starting Google authentication")

  const googleUser: GoogleUserInfo = await googleAuthClient.getUserInfo(input.code, input.redirectUri)
  /**
   * email (PII) はログに残さず、突合に必要な googleId のみ出力する。
   */
  logger.debug("AuthService: Retrieved Google user info", {
    googleId: googleUser.id,
  })

  const existingAccount = await repo.authAccountRepository.findByProvider("google", googleUser.id)

  let user: User
  let isNewUser = false

  if (existingAccount) {
    logger.info("AuthService: Existing user found", { userId: existingAccount.user.id })
    user = existingAccount.user
  } else {
    isNewUser = true
    logger.info("AuthService: Creating new user")
    /**
     * User と AuthAccount を 1 トランザクションで作成。どちらか片方だけが残る不整合を防ぐ。
     */
    user = await repo.transactionRunner.run(async (tx) => {
      const newUser = await repo.userRepository.create(
        {
          avatarUrl: googleUser.picture,
          email: googleUser.email,
          name: googleUser.name,
        },
        tx,
      )
      await repo.authAccountRepository.create(
        {
          provider: "google",
          providerAccountId: googleUser.id,
          userId: newUser.id,
        },
        tx,
      )
      return newUser
    })
    logger.info("AuthService: New user created", { userId: user.id })
  }

  const { accessToken, refreshToken } = await issueTokens(user.id, repo, tokenGenerators)

  return ok({
    accessToken,
    isNewUser,
    refreshToken,
    user,
  })
}

export type AuthenticateWithGitHubSuccess = {
  accessToken: string
  isNewUser: boolean
  refreshToken: string
  user: User
}

/**
 * GitHub アカウントでの認証
 *
 * web / mobile が受け取った Authorization Code（+ PKCE の code_verifier）を GitHub で検証し、ユーザー情報を取得する。
 * GitHub の id で既存ユーザーが見つかれば表示名とアイコンを最新化し、見つからなければ User + AuthAccount を作成して
 * Access/Refresh Token を発行する。
 *
 * code が使えない（期限切れ・使用済み・verifier 不一致）ときは 401 を Result.err で返し、
 * 外部サービス障害などの予期しないエラーは throw する。
 */
export const authenticateWithGitHub = async (
  input: { code: string; codeVerifier: string; redirectUri: string; timezone?: string },
  repo: Repositories,
  gitHubOAuthClient: IGitHubOAuthClient,
  tokenGenerators: TokenGenerators
): Promise<Result<AuthenticateWithGitHubSuccess>> => {
  logger.info("AuthService: Starting GitHub authentication")

  const gitHubUser = await gitHubOAuthClient.getUserInfo({
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: input.redirectUri,
  })
  if (!gitHubUser) {
    return err(unauthorizedError("GitHub authorization code is invalid"))
  }
  /**
   * email (PII) はログに残さず、突合に必要な githubId のみ出力する。
   */
  logger.debug("AuthService: Retrieved GitHub user info", {
    githubId: gitHubUser.id,
  })

  /**
   * 表示名は name、未設定なら login。ログインのたびに最新化する
   */
  const name = gitHubUser.name ?? gitHubUser.login
  const existingAccount = await repo.authAccountRepository.findByProvider("github", gitHubUser.id)

  if (existingAccount) {
    logger.info("AuthService: Existing user found", { userId: existingAccount.user.id })
    const user = await repo.userRepository.updateProfile(existingAccount.user.id, {
      avatarUrl: gitHubUser.avatarUrl,
      name,
    })
    const { accessToken, refreshToken } = await issueTokens(user.id, repo, tokenGenerators)
    return ok({ accessToken, isNewUser: false, refreshToken, user })
  }

  logger.info("AuthService: Creating new user")
  /**
   * メールが一致しても既存ユーザーに紐づけない（メール一致での自動統合はアカウント乗っ取りの経路になるため）。
   * users.email の unique 衝突だけを避け、衝突する場合は email を持たないユーザーとして作る
   */
  const emailOwner = gitHubUser.email ? await repo.userRepository.findByEmail(gitHubUser.email) : null
  /**
   * User と AuthAccount を 1 トランザクションで作成。どちらか片方だけが残る不整合を防ぐ。
   */
  const user = await repo.transactionRunner.run(async (tx) => {
    const newUser = await repo.userRepository.create(
      {
        avatarUrl: gitHubUser.avatarUrl ?? undefined,
        email: emailOwner ? undefined : gitHubUser.email ?? undefined,
        name,
        timezone: input.timezone,
      },
      tx,
    )
    await repo.authAccountRepository.create(
      {
        provider: "github",
        providerAccountId: gitHubUser.id,
        userId: newUser.id,
      },
      tx,
    )
    return newUser
  })
  logger.info("AuthService: New user created", { userId: user.id })

  const { accessToken, refreshToken } = await issueTokens(user.id, repo, tokenGenerators)
  return ok({ accessToken, isNewUser: true, refreshToken, user })
}

export type LoginAsDevUserSuccess = {
  accessToken: string
  refreshToken: string
  user: User
}

/**
 * 開発環境専用ログイン
 *
 * email で seed 済みの dev ユーザーを引き当てて Access/Refresh Token を発行する。
 * production での誤実行を防ぐためのガードは呼び出し側（controller / index.ts / PUBLIC_PATHS）で行う。
 * このサービス関数自体は環境非依存。
 */
export const loginAsDevUser = async (
  input: { email: string },
  repo: {
    refreshTokenRepository: RefreshTokenRepository
    userRepository: UserRepository
  },
  tokenGenerators: TokenGenerators
): Promise<Result<LoginAsDevUserSuccess>> => {
  /**
   * dev-login は dev 専用（seed 済みテストユーザー）だが、email を既定の info
   * レベルには残さず debug に下げる。
   */
  logger.debug("AuthService: dev-login attempt", { email: input.email })

  const user = await repo.userRepository.findByEmail(input.email)
  if (!user) {
    return err(notFoundError("Dev user not found"))
  }

  const accessToken = tokenGenerators.generateAccessToken(user.id)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(user.id)
  await repo.refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

  logger.info("AuthService: dev-login success", { userId: user.id })

  return ok({ accessToken, refreshToken, user })
}

export type RefreshTokensSuccess = {
  accessToken: string
  refreshToken: string
}

export type RefreshVerifier = (token: string) => { jti: string; userId: number } | null

/**
 * refresh token の持ち主を引く Repository。持ち主がまだ居るかを確かめるのに findById だけを使う。
 * 一般ユーザーは UserRepository、admin は AdminRepository を渡し、admin の refresh でも同じ持ち主の確かめと猶予を使う
 */
export type TokenOwnerRepository = {
  findById(id: number): Promise<{ id: number } | null>
}

/**
 * ローテーションした旧 refresh token に、発行済みの同じペアを返し続ける時間（秒）
 */
const ROTATION_GRACE_SECONDS = 30

/**
 * 猶予の間に、ローテーション済みの旧 refresh token がもう一度来たときの処理。新しく発行せず、発行済みの同じペアを返す。
 *
 * 次の場合に、2 回目の更新が 401 になってログアウトさせないため:
 * - 応答を受け取れなかったクライアント（web の timeout・通信断）。api はローテーションを終えているが、クライアントには旧 token が残る
 * - 同じ token での同時の更新（ページと prefetch など）
 * - web を複数台にしたとき（web のプロセス内のまとめ役は台をまたがない）
 *
 * 猶予の記録が無い（猶予を過ぎた・ローテーションしていない）、発行したペアが失効した（ログアウト）、ユーザーが削除済みはすべて 401。
 */
const reuseRotatedTokens = async (
  payload: { jti: string; userId: number },
  repo: { refreshTokenRepository: RefreshTokenRepository; tokenOwnerRepository: TokenOwnerRepository },
  verifier: RefreshVerifier
): Promise<Result<RefreshTokensSuccess>> => {
  const rotated = await repo.refreshTokenRepository.findRotatedTokens(payload.jti)
  if (!rotated) {
    return err(unauthorizedError("Refresh token has been revoked"))
  }

  const rotatedPayload = verifier(rotated.refreshToken)
  const rotatedUserId = rotatedPayload ? await repo.refreshTokenRepository.findUserId(rotatedPayload.jti) : null
  if (rotatedUserId === null || rotatedUserId !== payload.userId) {
    return err(unauthorizedError("Refresh token has been revoked"))
  }

  const user = await repo.tokenOwnerRepository.findById(payload.userId)
  if (!user) {
    return err(unauthorizedError("User not found"))
  }

  logger.debug("AuthService: Rotated tokens reused within grace period", { userId: payload.userId })

  return ok({ accessToken: rotated.accessToken, refreshToken: rotated.refreshToken })
}

/**
 * Refresh Token のローテーション
 *
 * 受け取った Refresh Token を検証し、Redis 上の jti と一致する場合は旧 jti を破棄して
 * 新しい Access Token + Refresh Token を発行する（1 回使用で無効化）。
 * ローテーション後 ROTATION_GRACE_SECONDS の間は、同じ旧 Refresh Token に発行済みの同じペアを返す（reuseRotatedTokens）。
 *
 * 検証失敗・既に無効化済み（猶予の外）・userId 不一致・ユーザーが削除済みはすべて 401 で返す。
 */
export const refreshTokens = async (
  input: { refreshToken: string },
  repo: { refreshTokenRepository: RefreshTokenRepository; tokenOwnerRepository: TokenOwnerRepository },
  verifier: RefreshVerifier,
  generators: TokenGenerators
): Promise<Result<RefreshTokensSuccess>> => {
  logger.info("AuthService: Starting refresh token rotation")

  const payload = verifier(input.refreshToken)
  if (!payload) {
    return err(unauthorizedError("Invalid refresh token"))
  }

  const userId = await repo.refreshTokenRepository.findUserId(payload.jti)
  if (userId === null) {
    return reuseRotatedTokens(payload, repo, verifier)
  }
  if (userId !== payload.userId) {
    return err(unauthorizedError("Refresh token has been revoked"))
  }

  /**
   * 削除済みユーザーの端末に残った refresh token。jti を消してから 401 にする
   * （jti はユーザー単位で一括削除できないため、使われたときに消す）
   */
  const user = await repo.tokenOwnerRepository.findById(userId)
  if (!user) {
    await repo.refreshTokenRepository.delete(payload.jti)
    return err(unauthorizedError("User not found"))
  }

  const accessToken = generators.generateAccessToken(userId)
  const { jti, token: refreshToken } = generators.generateRefreshToken(userId)
  await repo.refreshTokenRepository.save(jti, userId, REFRESH_TTL_SECONDS)

  /**
   * ローテーション: 旧 jti → 発行したペアを猶予の間だけ残してから、旧 jti を破棄する。
   * 先に残すので、旧 jti が消えて見えるリクエストは（猶予の間なら）必ず猶予の記録を見つける
   */
  await repo.refreshTokenRepository.saveRotatedTokens(payload.jti, { accessToken, refreshToken }, ROTATION_GRACE_SECONDS)
  await repo.refreshTokenRepository.delete(payload.jti)

  logger.debug("AuthService: Tokens rotated", { userId })

  return ok({ accessToken, refreshToken })
}

/**
 * ログアウト
 *
 * Refresh Token を検証して Redis から jti を削除する。冪等性を保つため、
 * 検証失敗時もエラーにせず 200 を返す（呼び出し元の Result.ok = true）。
 */
export const logout = async (
  input: { refreshToken: string },
  repo: { refreshTokenRepository: RefreshTokenRepository },
  verifier: RefreshVerifier
): Promise<Result<{ ok: true }>> => {
  logger.info("AuthService: Logout")

  const payload = verifier(input.refreshToken)
  if (!payload) {
    /** 無効なトークンでも成功扱いにして冪等性を保つ */
    return ok({ ok: true })
  }
  await repo.refreshTokenRepository.delete(payload.jti)
  return ok({ ok: true })
}
