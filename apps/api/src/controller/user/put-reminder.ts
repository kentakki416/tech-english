import { Response } from "express"

import { updateUserReminderRequestSchema, updateUserReminderResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { ReminderSettingRepository, UserRepository } from "../../repository"
import * as service from "../../service"

export class UserPutReminderController {
  constructor(
    private _reminderSettingRepository: ReminderSettingRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const body = parseRequest(updateUserReminderRequestSchema, req.body)

    const result = await service.reminder.saveReminderSetting(
      req.userId!,
      { isEnabled: body.is_enabled, time: body.time, weekdays: body.weekdays },
      { reminderSettingRepository: this._reminderSettingRepository, userRepository: this._userRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateUserReminderResponseSchema, {
      is_enabled: result.value.isEnabled,
      time: result.value.time,
      weekdays: result.value.weekdays,
    })
    return res.status(200).json(response)
  }
}
