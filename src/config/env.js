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

const normalizeEnvString = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "";
  }

  const hasMatchingDoubleQuotes = normalized.startsWith("\"") && normalized.endsWith("\"");
  const hasMatchingSingleQuotes = normalized.startsWith("'") && normalized.endsWith("'");

  if (hasMatchingDoubleQuotes || hasMatchingSingleQuotes) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
};

const getSecret = (key, fallback = "") => {
  const fileKey = `${key}_FILE`;
  if (process.env[fileKey]) {
    return normalizeEnvString(readSecretFile(process.env[fileKey]));
  }
  if (process.env[key]) {
    return normalizeEnvString(process.env[key]);
  }
  return normalizeEnvString(fallback);
};

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }
  return ["true", "1", "yes", "on"].includes(normalizeEnvString(value).toLowerCase());
};

const parseNumber = (value, defaultValue) => {
  const parsed = Number(normalizeEnvString(value));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return defaultValue;
};

const parseSmtpIpFamily = (value) => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const parsed = Number(value);
  if (parsed === 4 || parsed === 6) {
    return parsed;
  }

  return 0;
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

const parseTrustProxy = (value, defaultValue = 1) => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = normalizeEnvString(value);

  if (!normalized) {
    return defaultValue;
  }

  const lowered = normalized.toLowerCase();

  if (["true", "false"].includes(lowered)) {
    return lowered === "true";
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
};

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3100,

  // Database
  mongoUri: getSecret("MONGO_URI", isProduction ? "" : "mongodb://localhost:27017/votehub"),
  mongoServerSelectionTimeoutMs: parseNumber(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, isProduction ? 10_000 : 5_000),
  mongoSocketTimeoutMs: parseNumber(process.env.MONGO_SOCKET_TIMEOUT_MS, 45_000),
  mongoMaxPoolSize: parseNumber(process.env.MONGO_MAX_POOL_SIZE, 20),
  mongoMinPoolSize: parseNumber(process.env.MONGO_MIN_POOL_SIZE, isProduction ? 2 : 0),

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
  clientUrl: normalizeEnvString(process.env.CLIENT_URL),
  apiBaseUrl: normalizeEnvString(process.env.API_BASE_URL) || `http://localhost:${Number(process.env.PORT) || 3100}`,
  corsOrigins: parseOrigins(normalizeEnvString(process.env.CORS_ORIGINS) || normalizeEnvString(process.env.CLIENT_URL) || "http://localhost:3000"),

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
  logDir: process.env.LOG_DIR ,
  logToConsole: parseBoolean(process.env.LOG_TO_CONSOLE, true),
  logToFile: parseBoolean(process.env.LOG_TO_FILE, true),
  logRetentionDays: parseNumber(process.env.LOG_RETENTION_DAYS, 10),
  logCleanupIntervalHours: parseNumber(process.env.LOG_CLEANUP_INTERVAL_HOURS, 24),

  // Request handling
  bodyLimit: process.env.BODY_LIMIT || "100kb",
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, 1),

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
  emailVerificationUrlBase:
    normalizeEnvString(process.env.EMAIL_VERIFICATION_URL_BASE) ||
    `${normalizeEnvString(process.env.CLIENT_URL) || "http://localhost:3000"}/verify-email`,
  smtpHost: normalizeEnvString(process.env.SMTP_HOST),
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  smtpUser: normalizeEnvString(process.env.SMTP_USER),
  smtpPass: getSecret("SMTP_PASS", ""),
  smtpFrom: normalizeEnvString(process.env.SMTP_FROM) || "no-reply@votehub.local",
  smtpConnectionTimeoutMs: parseNumber(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10_000),
  smtpGreetingTimeoutMs: parseNumber(process.env.SMTP_GREETING_TIMEOUT_MS, 10_000),
  smtpSocketTimeoutMs: parseNumber(process.env.SMTP_SOCKET_TIMEOUT_MS, 15_000),
  smtpDnsTimeoutMs: parseNumber(process.env.SMTP_DNS_TIMEOUT_MS, 10_000),
  smtpIpFamily: parseSmtpIpFamily(process.env.SMTP_IP_FAMILY),

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
  if (!/^mongodb(\+srv)?:\/\//i.test(env.mongoUri)) {
    throw new Error("MONGO_URI must be a valid MongoDB connection string (mongodb:// or mongodb+srv://).");
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
  if (!env.voteEncryptionKey) {
    throw new Error("VOTE_ENCRYPTION_KEY must be set in production.");
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
