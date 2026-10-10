import rateLimit from "express-rate-limit"

/**
 * API 全体のレート制限。
 *
 * 同一クライアント（IP 単位）が一定時間内に送れるリクエスト数に上限を設け、
 * ブルートフォースやアプリ層 DoS を緩和する。上限を超えたら 429 を返す。
 * 認証の有無で基準を変える必要は無いため、全エンドポイントに同じ上限を適用する。
 *
 * 上限値（1 分あたり 300 リクエスト）は、フロントが複数 API を並列取得しても引っかからない
 * 程度に緩く、かつ機械的な連打は止まる水準。プロダクトに合わせて調整する。
 *
 * 注意: カウントは in-memory（インスタンス単位）。複数インスタンス構成では実効上限が
 * インスタンス数倍になるため、厳密な分散制限が要る場合は Redis ストア化や WAF を検討する。
 */
export const apiRateLimiter = rateLimit({
  legacyHeaders: false,
  limit: 300,
  message: { error: "Too many requests", status_code: 429 },
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
})
