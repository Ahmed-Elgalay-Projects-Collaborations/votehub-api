import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
};

const parseOrigins = (value) => {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const parseSameSite = (value) => {
  const normalized = String(value || "lax").toLowerCase();
  if (normalized === "strict") {
    return "strict";
  }
  if (normalized === "none") {
    return "none";
  }
  return "lax";
};

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3100,
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/votehub",
  jwtSecret: process.env.JWT_SECRET || "change_this_in_production_votehub",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  otpChallengeExpiresIn: process.env.OTP_CHALLENGE_EXPIRES_IN || "5m",
  adminStepUpExpiresIn: process.env.ADMIN_STEP_UP_EXPIRES_IN || "10m",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${Number(process.env.PORT) || 3100}`,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS || process.env.CLIENT_URL || "http://localhost:3000"),
  enableCookieAuth: parseBoolean(process.env.ENABLE_COOKIE_AUTH, true),
  authCookieName: process.env.AUTH_COOKIE_NAME || "votehub_access_token",
  csrfCookieName: process.env.CSRF_COOKIE_NAME || "votehub_csrf_token",
  cookieSameSite: parseSameSite(process.env.COOKIE_SAMESITE || "lax"),
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, isProduction),
  authCookieMaxAgeMs: Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || 60 * 60 * 1000,
  csrfCookieMaxAgeMs: Number(process.env.CSRF_COOKIE_MAX_AGE_MS) || 60 * 60 * 1000,
  enableMetrics: parseBoolean(process.env.ENABLE_METRICS, true),
  logDir: process.env.LOG_DIR || "logs",
  bodyLimit: process.env.BODY_LIMIT || "100kb",
  apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX) || 200,
  loginMaxFailedAttempts: Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS) || 10,
  loginLockWindowSeconds: Number(process.env.LOGIN_LOCK_WINDOW_SECONDS) || 15 * 60,
  loginLockMaxSeconds: Number(process.env.LOGIN_LOCK_MAX_SECONDS) || 24 * 60 * 60,
  emailVerificationTokenExpiresMinutes: Number(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES) || 60,
  emailVerificationUrlBase: process.env.EMAIL_VERIFICATION_URL_BASE || `${process.env.CLIENT_URL || "http://localhost:3000"}/verify-email`,
  otpIssuer: process.env.OTP_ISSUER || "VoteHub",
  otpEncryptionKey: process.env.OTP_ENCRYPTION_KEY || "",
  voteEncryptionKey: process.env.VOTE_ENCRYPTION_KEY || "",
  otpMaxFailedAttempts: Number(process.env.OTP_MAX_FAILED_ATTEMPTS) || 5,
  otpLockWindowSeconds: Number(process.env.OTP_LOCK_WINDOW_SECONDS) || 5 * 60,
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "no-reply@votehub.local",
  auditSigningKey: process.env.AUDIT_SIGNING_KEY || process.env.JWT_SECRET || "votehub_audit_signing_key",
  receiptSigningKey: process.env.RECEIPT_SIGNING_KEY || process.env.JWT_SECRET || "votehub_receipt_signing_key",
  replayProtectionTtlSeconds: Number(process.env.REPLAY_PROTECTION_TTL_SECONDS) || 24 * 60 * 60,
  riskScoreDecayPerMinute: Number(process.env.RISK_SCORE_DECAY_PER_MINUTE) || 1,
  riskMediumThreshold: Number(process.env.RISK_MEDIUM_THRESHOLD) || 25,
  riskHighThreshold: Number(process.env.RISK_HIGH_THRESHOLD) || 45,
  riskCriticalThreshold: Number(process.env.RISK_CRITICAL_THRESHOLD) || 70,
  riskBlockDurationSeconds: Number(process.env.RISK_BLOCK_DURATION_SECONDS) || 15 * 60,
  auditSalt: process.env.AUDIT_SALT || process.env.JWT_SECRET || "votehub_audit_salt",
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || "",
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || ""
};

if (isProduction) {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set in production.");
  }
  if (!process.env.JWT_SECRET || env.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set in production and be at least 32 characters long.");
  }
}

if (!process.env.JWT_SECRET && !isProduction) {
  console.warn("Warning: JWT_SECRET is not set. Using development fallback secret.");
}

if (env.cookieSameSite === "none" && !env.cookieSecure) {
  throw new Error("COOKIE_SECURE must be true when COOKIE_SAMESITE=none.");
}

if (isProduction && !env.otpEncryptionKey) {
  throw new Error("OTP_ENCRYPTION_KEY must be set in production.");
}

if (isProduction && !env.voteEncryptionKey && !env.otpEncryptionKey) {
  throw new Error("VOTE_ENCRYPTION_KEY or OTP_ENCRYPTION_KEY must be set in production.");
}

if (isProduction && (!env.auditSigningKey || env.auditSigningKey.length < 32)) {
  throw new Error("AUDIT_SIGNING_KEY must be set in production and be at least 32 characters.");
}

if (isProduction && (!env.receiptSigningKey || env.receiptSigningKey.length < 32)) {
  throw new Error("RECEIPT_SIGNING_KEY must be set in production and be at least 32 characters.");
}

export default env;
