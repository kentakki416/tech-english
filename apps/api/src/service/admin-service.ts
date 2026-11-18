import { Admin } from "@repo/domain"
import { err, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { AdminRepository } from "../repository"

/**
 * admins にいなければ 404 ではなく 401 を返す。admins から消された admin のトークンは、
 * 署名が正しくても使えないものとして扱う
 */
export const getAdminById = async (
  adminId: number,
  repo: { adminRepository: AdminRepository },
): Promise<Result<Admin>> => {
  const admin = await repo.adminRepository.findById(adminId)
  if (!admin) {
    logger.debug("AdminService: Admin not found", { adminId })
    return err(unauthorizedError("Admin no longer exists"))
  }
  return ok(admin)
}
