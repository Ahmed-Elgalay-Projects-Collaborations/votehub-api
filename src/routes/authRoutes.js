import { Router } from "express";
import {
  disableOtp,
  issueAdminStepUp,
  issueCsrfToken,
  login,
  logout,
  me,
  register,
  resendVerification,
  startOtpEnrollment,
  verifyAuditChain,
  verifyEmail,
  verifyLoginOtp,
  verifyOtpEnrollment
} from "../controllers/authController.js";
import { authorizeRoles, optionalAuth, requireAuth } from "../middlewares/authMiddleware.js";
import { requireAdminStepUp } from "../middlewares/adminStepUpMiddleware.js";
import { loginAbuseGuardMiddleware } from "../middlewares/loginAbuseGuardMiddleware.js";
import { validateRequestMiddleware } from "../middlewares/validateRequestMiddleware.js";
import {
  adminStepUpValidation,
  disableOtpValidation,
  loginValidation,
  registerValidation,
  resendVerificationValidation,
  startOtpEnrollmentValidation,
  verifyEmailValidation,
  verifyLoginOtpValidation,
  verifyOtpEnrollmentValidation
} from "../validations/authValidation.js";

const router = Router();

router.post("/register", registerValidation, validateRequestMiddleware, register);
router.get("/verify-email", verifyEmailValidation, validateRequestMiddleware, verifyEmail);
router.post("/resend-verification", resendVerificationValidation, validateRequestMiddleware, resendVerification);
router.post("/login", loginAbuseGuardMiddleware, loginValidation, validateRequestMiddleware, login);
router.post("/otp/verify-login", verifyLoginOtpValidation, validateRequestMiddleware, verifyLoginOtp);
router.post("/otp/setup", optionalAuth, startOtpEnrollmentValidation, validateRequestMiddleware, startOtpEnrollment);
router.post("/otp/verify-setup", optionalAuth, verifyOtpEnrollmentValidation, validateRequestMiddleware, verifyOtpEnrollment);
router.post("/otp/disable", requireAuth, disableOtpValidation, validateRequestMiddleware, disableOtp);
router.post("/admin/step-up", requireAuth, authorizeRoles("admin"), adminStepUpValidation, validateRequestMiddleware, issueAdminStepUp);
router.get("/admin/audit/verify", requireAuth, authorizeRoles("admin"), requireAdminStepUp, verifyAuditChain);
router.post("/logout", requireAuth, logout);
router.get("/csrf-token", requireAuth, issueCsrfToken);
router.get("/me", requireAuth, me);

export default router;
