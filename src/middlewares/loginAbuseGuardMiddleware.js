import { assertLoginAllowed } from "../services/loginAttemptService.js";
import { isRiskBlocked } from "../services/riskScoringService.js";
import { ApiError } from "../utils/apiError.js";
import { logSecurityEvent } from "../services/securityEventService.js";

export const loginAbuseGuardMiddleware = async (req, res, next) => {
  try {
    const blocked = isRiskBlocked({ ip: req.ip });
    if (blocked.blocked) {
      logSecurityEvent("risk_block_triggered", req, {
        scope: "ip",
        retryAfterSeconds: blocked.retryAfterSeconds
      });
      throw new ApiError(429, `Temporarily blocked due to suspicious activity. Retry in ${blocked.retryAfterSeconds} seconds.`, "RISK_BLOCKED", {
        retryAfterSeconds: blocked.retryAfterSeconds
      });
    }

    await assertLoginAllowed(req);
    next();
  } catch (error) {
    next(error);
  }
};
