import rateLimit from "express-rate-limit";
import env from "../config/env.js";
import { logSecurityEvent } from "../services/securityEventService.js";

export const apiRateLimiter = rateLimit({
  windowMs: env.apiRateLimitWindowMs,
  limit: env.apiRateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent("global_rate_limit_triggered", req, {
      windowMs: env.apiRateLimitWindowMs,
      limit: env.apiRateLimitMax
    });

    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please try again later."
      },
      requestId: req.id
    });
  }
});

