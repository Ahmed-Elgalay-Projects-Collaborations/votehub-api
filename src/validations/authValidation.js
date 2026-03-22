import { body, query } from "express-validator";

export const registerValidation = [
  body("fullName")
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage("fullName must be between 3 and 120 characters"),
  body("email").trim().isEmail().withMessage("email must be valid").normalizeEmail(),
  body("password")
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage("password must be between 8 and 128 characters")
    .matches(/[A-Z]/)
    .withMessage("password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("password must contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("password must contain at least one digit")
];

export const loginValidation = [
  body("email").trim().isEmail().withMessage("email must be valid").normalizeEmail(),
  body("password").isString().notEmpty().withMessage("password is required")
];

export const verifyEmailValidation = [query("token").isString().notEmpty().withMessage("token is required")];

export const resendVerificationValidation = [body("email").trim().isEmail().withMessage("email must be valid").normalizeEmail()];

export const verifyLoginOtpValidation = [
  body("otpChallengeToken").isString().notEmpty().withMessage("otpChallengeToken is required"),
  body("otpCode")
    .optional()
    .isString()
    .matches(/^[0-9]{6}$/)
    .withMessage("otpCode must be a 6-digit code"),
  body("recoveryCode").optional().isString().isLength({ min: 6, max: 32 }).withMessage("recoveryCode is invalid"),
  body().custom((value) => {
    if (!value.otpCode && !value.recoveryCode) {
      throw new Error("otpCode or recoveryCode is required");
    }
    return true;
  })
];

export const startOtpEnrollmentValidation = [
  body("challengeToken").optional().isString().notEmpty().withMessage("challengeToken cannot be empty")
];

export const verifyOtpEnrollmentValidation = [
  body("challengeToken").optional().isString().notEmpty().withMessage("challengeToken cannot be empty"),
  body("otpCode")
    .isString()
    .matches(/^[0-9]{6}$/)
    .withMessage("otpCode must be a 6-digit code")
];

export const disableOtpValidation = [
  body("currentPassword").isString().notEmpty().withMessage("currentPassword is required"),
  body("otpCode")
    .optional()
    .isString()
    .matches(/^[0-9]{6}$/)
    .withMessage("otpCode must be a 6-digit code"),
  body("recoveryCode").optional().isString().isLength({ min: 6, max: 32 }).withMessage("recoveryCode is invalid"),
  body().custom((value) => {
    if (!value.otpCode && !value.recoveryCode) {
      throw new Error("otpCode or recoveryCode is required");
    }
    return true;
  })
];

export const adminStepUpValidation = [
  body("currentPassword").isString().notEmpty().withMessage("currentPassword is required"),
  body("otpCode")
    .optional()
    .isString()
    .matches(/^[0-9]{6}$/)
    .withMessage("otpCode must be a 6-digit code"),
  body("recoveryCode").optional().isString().isLength({ min: 6, max: 32 }).withMessage("recoveryCode is invalid"),
  body().custom((value) => {
    if (!value.otpCode && !value.recoveryCode) {
      throw new Error("otpCode or recoveryCode is required");
    }
    return true;
  })
];
