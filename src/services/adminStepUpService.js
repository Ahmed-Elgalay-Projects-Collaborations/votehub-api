import { ApiError } from "../utils/apiError.js";
import { signAdminStepUpToken, verifyAdminStepUpToken } from "../utils/jwt.js";

export const issueAdminStepUpToken = (user) => {
  if (!user || user.role !== "admin") {
    throw new ApiError(403, "Admin privileges are required", "ADMIN_REQUIRED");
  }

  return signAdminStepUpToken({
    sub: user.id,
    role: user.role
  });
};

export const parseAdminStepUpToken = (token) => {
  try {
    const payload = verifyAdminStepUpToken(token);
    if (!payload?.jti || payload?.role !== "admin") {
      throw new Error("Invalid payload");
    }
    return payload;
  } catch (error) {
    throw new ApiError(401, "Invalid or expired admin step-up token", "ADMIN_STEP_UP_INVALID");
  }
};
