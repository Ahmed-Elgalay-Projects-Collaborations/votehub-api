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
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
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

export default env;
