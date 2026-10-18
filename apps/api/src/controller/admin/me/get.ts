import { Response } from "express"

import { getAdminMeResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminAuthRequest } from "../../../middleware/admin-auth"
import { AdminRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * GET /api/admin/me
 *
 * サインイン中の admin を返す。req.adminId は adminAuthMiddleware が確定済みの前提
 */
export class AdminMeGetController {
  constructor(private _adminRepository: AdminRepository) {}

  public async execute(req: AdminAuthRequest, res: Response) {
    logger.info("AdminMeGetController: Fetching signed-in admin")

    const result = await service.admin.getAdminById(req.adminId!, { adminRepository: this._adminRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminMeResponseSchema, {
      id: result.value.id,
      avatar_url: result.value.avatarUrl,
      email: result.value.email,
      last_signed_in_at: result.value.lastSignedInAt?.toISOString() ?? null,
      name: result.value.name,
      created_at: result.value.createdAt.toISOString(),
    })

    return res.status(200).json(response)
  }
}
