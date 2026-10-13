import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    /**
     * 共通ヘッダー（AppHeader）の GitHub のアバター
     */
    remotePatterns: [{ hostname: "avatars.githubusercontent.com", protocol: "https" }],
  },
}

export default nextConfig
