import fs from "fs";

// This config intentionally does NOT load `.env` files (no dotenv).
// In production, inject environment variables via the platform (Render/Docker/Kubernetes).
// In development, use `docker compose --env-file ...` / `env_file:` or your shell env.

const isProduction = process.env.NODE_ENV === "production";

const readSecretFile = (filePath) => {
  if (!filePath) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8").trim();
};

const getSecret = (key, fallback = "") => {
  const fileKey = `${key}_FILE`;
  if (process.env[fileKey]) {
    return readSecretFile(process.env[fileKey]);
  }
  if (process.env[key]) {
    return String(process.env[key]);
  }
  return fallback;
};

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

  // Database
  mongoUri: getSecret("MONGO_URI", isProduction ? "" : "mongodb://localhost:27017/votehub"),

  // Auth / crypto
  jwtSecret: getSecret("JWT_SECRET", isProduction ? "" : "dev_only_change_me_votehub"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  otpChallengeExpiresIn: process.env.OTP_CHALLENGE_EXPIRES_IN || "5m",
  adminStepUpExpiresIn: process.env.ADMIN_STEP_UP_EXPIRES_IN || "10m",
  otpIssuer: process.env.OTP_ISSUER || "VoteHub",
  otpEncryptionKey: getSecret("OTP_ENCRYPTION_KEY", ""),
  voteEncryptionKey: getSecret("VOTE_ENCRYPTION_KEY", ""),
  auditSigningKey: getSecret("AUDIT_SIGNING_KEY", ""),
  receiptSigningKey: getSecret("RECEIPT_SIGNING_KEY", ""),
  auditSalt: getSecret("AUDIT_SALT", ""),

  // Client / CORS
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${Number(process.env.PORT) || 3100}`,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS || process.env.CLIENT_URL || "http://localhost:3000"),

  // Cookies / CSRF
  enableCookieAuth: parseBoolean(process.env.ENABLE_COOKIE_AUTH, true),
  authCookieName: process.env.AUTH_COOKIE_NAME || "votehub_access_token",
  csrfCookieName: process.env.CSRF_COOKIE_NAME || "votehub_csrf_token",
  cookieSameSite: parseSameSite(process.env.COOKIE_SAMESITE || "lax"),
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, isProduction),
  authCookieMaxAgeMs: Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || 60 * 60 * 1000,
  csrfCookieMaxAgeMs: Number(process.env.CSRF_COOKIE_MAX_AGE_MS) || 60 * 60 * 1000,

  // Metrics
  enableMetrics: parseBoolean(process.env.ENABLE_METRICS, true),
  metricsRequireAuth: parseBoolean(process.env.METRICS_REQUIRE_AUTH, isProduction),
  metricsToken: getSecret("METRICS_TOKEN", ""),

  // Logging
  logDir: process.env.LOG_DIR || "logs",
  logToConsole: parseBoolean(process.env.LOG_TO_CONSOLE, true),
  logToFile: parseBoolean(process.env.LOG_TO_FILE, true),

  // Request handling
  bodyLimit: process.env.BODY_LIMIT || "100kb",

  // Rate limiting
  apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX) || 200,
  loginMaxFailedAttempts: Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS) || 10,
  loginLockWindowSeconds: Number(process.env.LOGIN_LOCK_WINDOW_SECONDS) || 15 * 60,
  loginLockMaxSeconds: Number(process.env.LOGIN_LOCK_MAX_SECONDS) || 24 * 60 * 60,
  otpMaxFailedAttempts: Number(process.env.OTP_MAX_FAILED_ATTEMPTS) || 5,
  otpLockWindowSeconds: Number(process.env.OTP_LOCK_WINDOW_SECONDS) || 5 * 60,

  // Email verification + SMTP
  emailVerificationTokenExpiresMinutes: Number(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES) || 60,
  emailVerificationUrlBase: process.env.EMAIL_VERIFICATION_URL_BASE || `${process.env.CLIENT_URL || "http://localhost:3000"}/verify-email`,
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: getSecret("SMTP_PASS", ""),
  smtpFrom: process.env.SMTP_FROM || "no-reply@votehub.local",

  // Replay / risk engine
  replayProtectionTtlSeconds: Number(process.env.REPLAY_PROTECTION_TTL_SECONDS) || 24 * 60 * 60,
  riskScoreDecayPerMinute: Number(process.env.RISK_SCORE_DECAY_PER_MINUTE) || 1,
  riskMediumThreshold: Number(process.env.RISK_MEDIUM_THRESHOLD) || 25,
  riskHighThreshold: Number(process.env.RISK_HIGH_THRESHOLD) || 45,
  riskCriticalThreshold: Number(process.env.RISK_CRITICAL_THRESHOLD) || 70,
  riskBlockDurationSeconds: Number(process.env.RISK_BLOCK_DURATION_SECONDS) || 15 * 60,

  // Bootstrap admin (optional)
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || "",
  defaultAdminPassword: getSecret("DEFAULT_ADMIN_PASSWORD", "")
};

if (isProduction) {
  if (!env.mongoUri) {
    throw new Error(
      "MONGO_URI must be set in production. If you're running with `docker run`, pass env vars explicitly (e.g. `--env-file .env`) and make sure MONGO_URI points to a reachable MongoDB host (inside Docker: use `host.docker.internal` or a Docker network hostname, not `localhost`)."
    );
  }
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set in production and be at least 32 characters long.");
  }
  if (!process.env.CLIENT_URL) {
    throw new Error("CLIENT_URL must be set in production.");
  }
  if (env.enableMetrics && env.metricsRequireAuth && !env.metricsToken) {
    throw new Error("METRICS_TOKEN must be set (or METRICS_REQUIRE_AUTH=false) when ENABLE_METRICS=true in production.");
  }
  if (!env.otpEncryptionKey) {
    throw new Error("OTP_ENCRYPTION_KEY must be set in production.");
  }
  if (!env.voteEncryptionKey && !env.otpEncryptionKey) {
    throw new Error("VOTE_ENCRYPTION_KEY or OTP_ENCRYPTION_KEY must be set in production.");
  }
  if (!env.auditSigningKey || env.auditSigningKey.length < 32) {
    throw new Error("AUDIT_SIGNING_KEY must be set in production and be at least 32 characters.");
  }
  if (!env.receiptSigningKey || env.receiptSigningKey.length < 32) {
    throw new Error("RECEIPT_SIGNING_KEY must be set in production and be at least 32 characters.");
  }
}

if (env.cookieSameSite === "none" && !env.cookieSecure) {
  throw new Error("COOKIE_SECURE must be true when COOKIE_SAMESITE=none.");
}

export default env;
