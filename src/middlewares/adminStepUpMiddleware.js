import { ApiError } from "../utils/apiError.js";
import { logSecurityEvent } from "../services/securityEventService.js";
import { consumeOneTimeToken } from "../services/replayProtectionService.js";
import { parseAdminStepUpToken } from "../services/adminStepUpService.js";

const getStepUpToken = (req) => req.headers["x-admin-step-up-token"];

export const requireAdminStepUp = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      throw new ApiError(403, "Admin privileges are required", "ADMIN_REQUIRED");
    }

    const token = getStepUpToken(req);
    if (!token || typeof token !== "string") {
      logSecurityEvent("admin_step_up_missing", req, { reason: "missing_token" });
      throw new ApiError(401, "Admin step-up token is required", "ADMIN_STEP_UP_REQUIRED");
    }

    const payload = parseAdminStepUpToken(token);

    if (String(payload.sub) !== String(req.user.id)) {
      logSecurityEvent("admin_step_up_failed", req, { reason: "subject_mismatch" });
      throw new ApiError(403, "Admin step-up token does not match authenticated user", "ADMIN_STEP_UP_SUBJECT_MISMATCH");
    }

    await consumeOneTimeToken({
      tokenValue: payload.jti,
      tokenType: `admin_step_up:${payload.sub}`,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null
    });

    req.adminStepUp = {
      tokenId: payload.jti,
      verifiedAt: new Date().toISOString()
    };

    return next();
  } catch (error) {
    if (error.code === "REPLAY_DETECTED") {
      logSecurityEvent("admin_step_up_failed", req, { reason: "replay_detected" });
    } else if (error.code === "ADMIN_STEP_UP_INVALID") {
      logSecurityEvent("admin_step_up_failed", req, { reason: "invalid_token" });
    }
    return next(error);
  }
};

