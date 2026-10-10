import { Request, Response } from "express"

import { authGitHubRequestSchema, authGitHubResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { IGitHubOAuthClient } from "../../client/github-oauth"
import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  AuthAccountRepository,
  RefreshTokenRepository,
  type TransactionRunner,
  UserRepository,
} from "../../repository"
import * as service from "../../service"

/**
 * POST /api/auth/github
 *
 * GitHub OAuth の Authorization Code（+ PKCE の code_verifier）を検証し、Access/Refresh Token を発行する API
 */
export class AuthGitHubController {
  constructor(
    private _authAccountRepository: AuthAccountRepository,
    private _userRepository: UserRepository,
    private _refreshTokenRepository: RefreshTokenRepository,
    private _transactionRunner: TransactionRunner,
    private _gitHubOAuthClient: IGitHubOAuthClient
  ) {}

  public async execute(req: Request, res: Response) {
    logger.info("AuthGitHubController: Verifying GitHub authorization code")

    const {
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      timezone,
    } = parseRequest(authGitHubRequestSchema, req.body)

    const result = await service.auth.authenticateWithGitHub(
      { code, codeVerifier, redirectUri, timezone },
      {
        authAccountRepository: this._authAccountRepository,
        refreshTokenRepository: this._refreshTokenRepository,
        transactionRunner: this._transactionRunner,
        userRepository: this._userRepository,
      },
      this._gitHubOAuthClient,
      { generateAccessToken, generateRefreshToken }
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { accessToken, isNewUser, refreshToken, user } = result.value

    const response = parseResponse(authGitHubResponseSchema, {
      access_token: accessToken,
      is_new_user: isNewUser,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        avatar_url: user.avatarUrl,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
        created_at: user.createdAt.toISOString(),
      },
    })

    return res.status(200).json(response)
  }
}
