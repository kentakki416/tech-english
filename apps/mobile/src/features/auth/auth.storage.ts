import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

/**
 * api が発行した JWT の保管場所（expo-secure-store。iOS は Keychain、Android は Keystore で暗号化される）
 */
const ACCESS_TOKEN_KEY = "techenglish.access_token"
const REFRESH_TOKEN_KEY = "techenglish.refresh_token"

export type StoredTokens = {
  accessToken: string
  refreshToken: string
}

type TokenStore = Pick<typeof SecureStore, "deleteItemAsync" | "getItemAsync" | "setItemAsync">

/**
 * 開発中の web 表示（`expo start --web`）だけの保管場所。secure-store は web で動かず、
 * ログイン後の画面をブラウザで確かめられないため localStorage に置く（暗号化しない）
 */
const devWebTokenStore: TokenStore = {
  deleteItemAsync: async (key) => {
    window.localStorage.removeItem(key)
  },
  getItemAsync: async (key) => window.localStorage.getItem(key),
  setItemAsync: async (key, value) => {
    window.localStorage.setItem(key, value)
  },
}

/**
 * `__DEV__` のときだけ web で localStorage を使う。本番の web ビルド（`__DEV__` が false）と iOS / Android は secure-store のまま
 */
const tokenStore: TokenStore = __DEV__ && Platform.OS === "web" ? devWebTokenStore : SecureStore

/**
 * 保存済みのトークンを返す。片方でも欠けていれば未ログインとして null
 */
export const getStoredTokens = async (): Promise<StoredTokens | null> => {
  const [accessToken, refreshToken] = await Promise.all([
    tokenStore.getItemAsync(ACCESS_TOKEN_KEY),
    tokenStore.getItemAsync(REFRESH_TOKEN_KEY),
  ])
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

export const saveTokens = async (tokens: StoredTokens): Promise<void> => {
  await Promise.all([
    tokenStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    tokenStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ])
}

export const clearStoredTokens = async (): Promise<void> => {
  await Promise.all([
    tokenStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    tokenStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ])
}
