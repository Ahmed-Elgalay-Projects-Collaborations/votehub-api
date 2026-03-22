import client from "prom-client";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequestDuration = new client.Histogram({
  name: "votehub_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry]
});

const securityEventsCounter = new client.Counter({
  name: "votehub_security_events_total",
  help: "Count of security events by event type",
  labelNames: ["event"],
  registers: [registry]
});

const httpResponsesCounter = new client.Counter({
  name: "votehub_http_responses_total",
  help: "Count of HTTP responses by status code",
  labelNames: ["status_code"],
  registers: [registry]
});

const loginAttemptsCounter = new client.Counter({
  name: "votehub_login_attempts_total",
  help: "Count of login attempts by outcome",
  labelNames: ["outcome"],
  registers: [registry]
});

const otpAttemptsCounter = new client.Counter({
  name: "votehub_otp_attempts_total",
  help: "Count of OTP-related attempts",
  labelNames: ["context", "outcome"],
  registers: [registry]
});

const emailVerificationCounter = new client.Counter({
  name: "votehub_email_verification_events_total",
  help: "Count of email verification events",
  labelNames: ["outcome"],
  registers: [registry]
});

const rateLimitCounter = new client.Counter({
  name: "votehub_rate_limit_triggers_total",
  help: "Count of rate limit triggers by scope",
  labelNames: ["scope"],
  registers: [registry]
});

const unauthorizedAccessCounter = new client.Counter({
  name: "votehub_unauthorized_access_events_total",
  help: "Count of unauthorized/forbidden attempts",
  labelNames: ["type"],
  registers: [registry]
});

const suspiciousEventsCounter = new client.Counter({
  name: "votehub_suspicious_events_total",
  help: "Count of suspicious request patterns",
  labelNames: ["type"],
  registers: [registry]
});

const voteSubmissionCounter = new client.Counter({
  name: "votehub_vote_submissions_total",
  help: "Count of vote submission attempts by outcome",
  labelNames: ["outcome"],
  registers: [registry]
});

const riskBlockCounter = new client.Counter({
  name: "votehub_risk_blocks_total",
  help: "Count of risk engine blocks",
  labelNames: ["scope"],
  registers: [registry]
});

const incrementMappedSecurityMetric = (event) => {
  if (event === "login_success") {
    loginAttemptsCounter.inc({ outcome: "success" });
  }

  if (event === "failed_login_attempt") {
    loginAttemptsCounter.inc({ outcome: "failed_password" });
  }

  if (event === "otp_failed_attempt") {
    otpAttemptsCounter.inc({ context: "login_or_setup", outcome: "failed" });
  }

  if (event === "otp_enabled") {
    otpAttemptsCounter.inc({ context: "setup", outcome: "enabled" });
  }

  if (event === "admin_step_up_issued") {
    otpAttemptsCounter.inc({ context: "admin_step_up", outcome: "success" });
  }

  if (event === "admin_step_up_failed") {
    otpAttemptsCounter.inc({ context: "admin_step_up", outcome: "failed" });
  }

  if (event === "otp_disabled") {
    otpAttemptsCounter.inc({ context: "disable", outcome: "success" });
  }

  if (event === "email_verification_success") {
    emailVerificationCounter.inc({ outcome: "success" });
  }

  if (event === "email_verification_failed" || event === "suspicious_verification_token_usage") {
    emailVerificationCounter.inc({ outcome: "failed" });
  }

  if (event === "verification_email_sent") {
    emailVerificationCounter.inc({ outcome: "sent" });
  }

  if (event === "vote_cast") {
    voteSubmissionCounter.inc({ outcome: "success" });
  }

  if (event === "vote_rejected") {
    voteSubmissionCounter.inc({ outcome: "rejected" });
  }

  if (event === "login_rate_limit_triggered" || event === "global_rate_limit_triggered") {
    rateLimitCounter.inc({ scope: event });
  }

  if (event === "risk_block_triggered") {
    riskBlockCounter.inc({ scope: "risk_engine" });
  }

  if (
    event === "missing_auth_token" ||
    event === "forbidden_resource_access" ||
    event === "token_validation_failed" ||
    event === "unverified_user_access_attempt" ||
    event === "unverified_login_attempt" ||
    event === "csrf_token_validation_failed" ||
    event === "admin_step_up_missing" ||
    event === "admin_step_up_failed"
  ) {
    unauthorizedAccessCounter.inc({ type: event });
  }

  if (
    event === "suspicious_input_sanitized" ||
    event === "suspicious_verification_token_usage" ||
    event === "admin_login_without_otp_attempt" ||
    event === "honeypot_triggered" ||
    event === "otp_challenge_replay_detected" ||
    event === "admin_step_up_failed" ||
    event === "risk_based_auth_escalation"
  ) {
    suspiciousEventsCounter.inc({ type: event });
  }
};

export const incrementSecurityMetric = (event) => {
  securityEventsCounter.inc({ event });
  incrementMappedSecurityMetric(event);
};

export const metricsMiddleware = (req, res, next) => {
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const route = req.route?.path || req.baseUrl || req.path;
    const statusCode = String(res.statusCode);

    end({
      method: req.method,
      route,
      status_code: statusCode
    });

    httpResponsesCounter.inc({ status_code: statusCode });

    if (["401", "403", "429"].includes(statusCode)) {
      unauthorizedAccessCounter.inc({ type: `http_${statusCode}` });
    }
  });

  next();
};

export const metricsRouteHandler = async (req, res, next) => {
  try {
    res.setHeader("Content-Type", registry.contentType);
    res.status(200).send(await registry.metrics());
  } catch (error) {
    next(error);
  }
};
