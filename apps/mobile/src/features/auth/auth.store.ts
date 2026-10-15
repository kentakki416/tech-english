import { create } from "zustand"

/**
 * ログイン状態。loading は起動直後に secure-store を読み終えるまで
 */
export type AuthStatus = "loading" | "signedIn" | "signedOut"

type AuthState = {
  setStatus: (status: AuthStatus) => void
  status: AuthStatus
}

export const useAuthStore = create<AuthState>((set) => ({
  setStatus: (status) => set({ status }),
  status: "loading",
}))
