import * as SecureStore from "expo-secure-store"

/**
 * api が発行した JWT の保管場所（expo-secure-store。iOS は Keychain、Android は Keystore で暗号化される）
 */
const ACCESS_TOKEN_KEY = "techenglish.access_token"
const REFRESH_TOKEN_KEY = "techenglish.refresh_token"

export type StoredTokens = {
  accessToken: string
  refreshToken: string
}

/**
 * 保存済みのトークンを返す。片方でも欠けていれば未ログインとして null
 */
export const getStoredTokens = async (): Promise<StoredTokens | null> => {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ])
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

export const saveTokens = async (tokens: StoredTokens): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ])
}

export const clearStoredTokens = async (): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ])
}
