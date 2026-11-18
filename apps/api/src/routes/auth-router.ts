import { Router } from "express"

import { AuthDevLoginController } from "../controller/auth/dev-login"
import { AuthGitHubController } from "../controller/auth/github"
import { AuthGoogleController } from "../controller/auth/google"
import { AuthLogoutController } from "../controller/auth/logout"
import { AuthRefreshController } from "../controller/auth/refresh"

type AuthRouterControllers = {
  devLogin?: AuthDevLoginController
  github?: AuthGitHubController
  google?: AuthGoogleController
  logout?: AuthLogoutController
  refresh?: AuthRefreshController
}

export const authRouter = (controllers: AuthRouterControllers): Router => {
  const router = Router()

  if (controllers.github) {
    const controller = controllers.github
    router.post("/github", async (req, res) => controller.execute(req, res))
  }

  if (controllers.google) {
    const controller = controllers.google
    router.post("/google", async (req, res) => controller.execute(req, res))
  }

  if (controllers.devLogin) {
    const controller = controllers.devLogin
    router.post("/dev-login", async (req, res) => controller.execute(req, res))
  }

  if (controllers.refresh) {
    const controller = controllers.refresh
    router.post("/refresh", async (req, res) => controller.execute(req, res))
  }

  if (controllers.logout) {
    const controller = controllers.logout
    router.post("/logout", async (req, res) => controller.execute(req, res))
  }

  return router
}
