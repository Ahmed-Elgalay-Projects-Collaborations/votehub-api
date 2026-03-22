import { body } from "express-validator";

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

