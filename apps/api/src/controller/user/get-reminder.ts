import { Response } from "express"

import { getUserReminderResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { ReminderSettingRepository } from "../../repository"
import * as service from "../../service"

/**
 * リマインダーの設定の取得API（GET /api/user/reminder）。未保存なら既定値（オフ・毎日・21:00）を返す
 */
export class UserGetReminderController {
  constructor(private _reminderSettingRepository: ReminderSettingRepository) {}

  public async execute(req: AuthRequest, res: Response) {
    const result = await service.reminder.getReminderSetting(req.userId!, {
      reminderSettingRepository: this._reminderSettingRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getUserReminderResponseSchema, {
      is_enabled: result.value.isEnabled,
      time: result.value.time,
      weekdays: result.value.weekdays,
    })
    return res.status(200).json(response)
  }
}
