import mongoose from "mongoose";
import { appLogger } from "../config/logger.js";
import { ApiError } from "../utils/apiError.js";

const normalizeError = (error) => {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return new ApiError(400, "Validation failed", "VALIDATION_ERROR", error.errors);
  }

  if (error instanceof mongoose.Error.CastError) {
    return new ApiError(400, "Invalid resource identifier", "INVALID_ID");
  }

  return new ApiError(500, "Internal server error", "INTERNAL_SERVER_ERROR");
};

export const errorHandler = (error, req, res, next) => {
  const normalized = normalizeError(error);
  const isServerError = normalized.statusCode >= 500;

  if (isServerError) {
    appLogger.error("Unhandled server error", {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      stack: error.stack,
      message: error.message
    });
  } else {
    appLogger.warn("Handled application error", {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message
    });
  }

  res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {})
    },
    requestId: req.id
  });
};

