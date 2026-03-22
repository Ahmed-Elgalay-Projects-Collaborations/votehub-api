import { validationResult } from "express-validator";
import { ApiError } from "../utils/apiError.js";

export const validateRequestMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  return next(
    new ApiError(400, "Invalid request data", "VALIDATION_ERROR", errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
      location: error.location
    })))
  );
};

