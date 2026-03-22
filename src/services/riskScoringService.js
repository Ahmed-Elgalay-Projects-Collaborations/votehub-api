import env from "../config/env.js";

const scoreStore = new Map();
const blockStore = new Map();

const EVENT_WEIGHTS = {
  failed_login_attempt: 10,
  otp_failed_attempt: 12,
  token_validation_failed: 8,
  forbidden_resource_access: 7,
  login_rate_limit_triggered: 14,
  global_rate_limit_triggered: 10,
  honeypot_triggered: 25,
  suspicious_input_sanitized: 8,
  suspicious_verification_token_usage: 10,
  csrf_token_validation_failed: 8,
  admin_step_up_failed: 15,
  admin_step_up_missing: 12,
  otp_challenge_replay_detected: 15,
  vote_rejected: 4
};

const buildKey = (ip, userId = "anonymous") => `${ip || "unknown-ip"}:${userId || "anonymous"}`;

const getScoreEntry = (key) => {
  const now = Date.now();
  const existing = scoreStore.get(key);
  if (!existing) {
    return { score: 0, updatedAt: now };
  }

  const elapsedMinutes = Math.max((now - existing.updatedAt) / 60000, 0);
  const decayed = Math.max(existing.score - elapsedMinutes * env.riskScoreDecayPerMinute, 0);
  return { score: decayed, updatedAt: now };
};

const saveScoreEntry = (key, score) => {
  scoreStore.set(key, {
    score,
    updatedAt: Date.now()
  });
};

export const recordRiskEvent = ({ eventType, ip, userId = null }) => {
  const weight = EVENT_WEIGHTS[eventType] || 0;
  if (!weight) {
    return;
  }

  const key = buildKey(ip, userId);
  const next = getScoreEntry(key);
  next.score += weight;
  saveScoreEntry(key, next.score);

  if (next.score >= env.riskCriticalThreshold) {
    blockStore.set(key, Date.now() + env.riskBlockDurationSeconds * 1000);
  }
};

export const getRiskScore = ({ ip, userId = null }) => {
  const key = buildKey(ip, userId);
  const next = getScoreEntry(key);
  saveScoreEntry(key, next.score);
  return next.score;
};

export const isRiskBlocked = ({ ip, userId = null }) => {
  const key = buildKey(ip, userId);
  const blockedUntil = blockStore.get(key);
  if (!blockedUntil) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  if (blockedUntil <= Date.now()) {
    blockStore.delete(key);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return {
    blocked: true,
    retryAfterSeconds: Math.ceil((blockedUntil - Date.now()) / 1000)
  };
};

export const evaluateLoginRisk = ({ user, ip, userAgent, failedAttempts = 0 }) => {
  let score = 0;
  const reasons = [];

  if (user.role === "admin") {
    score += 20;
    reasons.push("admin_account");
  }

  if (failedAttempts > 0) {
    score += failedAttempts * 3;
    reasons.push("failed_attempt_history");
  }

  if (user.lastLoginIp && user.lastLoginIp !== ip) {
    score += 20;
    reasons.push("new_ip");
  }

  if (user.lastLoginUserAgent && userAgent && user.lastLoginUserAgent !== userAgent) {
    score += 10;
    reasons.push("new_user_agent");
  }

  const ipScore = getRiskScore({ ip });
  const userScore = getRiskScore({ ip, userId: user.id });
  score += Math.max(ipScore * 0.4, 0) + Math.max(userScore * 0.6, 0);

  let level = "low";
  if (score >= env.riskCriticalThreshold) {
    level = "critical";
  } else if (score >= env.riskHighThreshold) {
    level = "high";
  } else if (score >= env.riskMediumThreshold) {
    level = "medium";
  }

  return {
    score: Number(score.toFixed(2)),
    level,
    reasons
  };
};

export const clearRiskForPrincipal = ({ ip, userId = null }) => {
  scoreStore.delete(buildKey(ip, userId));
};
