import { NextRequest, NextResponse } from "next/server"

import { clearAuthCookies } from "@/libs/auth"

export const GET = async (req: NextRequest) => {
  await clearAuthCookies()
  return NextResponse.redirect(new URL("/sign-in", req.url))
}
