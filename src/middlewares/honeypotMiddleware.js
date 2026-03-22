import { ApiError } from "../utils/apiError.js";
import { logSecurityEvent } from "../services/securityEventService.js";

const suspiciousPathPatterns = [/\/wp-admin/i, /\/phpmyadmin/i, /\/\.env/i, /\/admin\/debug/i, /\/debug\/vars/i];
const trapFieldNames = new Set(["__honeypot", "honeypot", "__trap", "votehubTrap"]);

const hasTrapField = (source = {}) => {
  if (!source || typeof source !== "object") {
    return null;
  }

  const keys = Object.keys(source);
  const matched = keys.find((key) => trapFieldNames.has(key));
  if (!matched) {
    return null;
  }

  const value = source[matched];
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return matched;
};

export const honeypotMiddleware = (req, res, next) => {
  const matchedPathPattern = suspiciousPathPatterns.find((pattern) => pattern.test(req.path));
  if (matchedPathPattern) {
    logSecurityEvent("honeypot_triggered", req, {
      type: "path_probe",
      pattern: matchedPathPattern.source
    });
    return next(new ApiError(404, "Not found", "NOT_FOUND"));
  }

  const bodyTrap = hasTrapField(req.body);
  const queryTrap = hasTrapField(req.query);
  const headerTrap = req.headers["x-votehub-trap"];

  if (bodyTrap || queryTrap || headerTrap) {
    logSecurityEvent("honeypot_triggered", req, {
      type: "trap_field",
      field: bodyTrap || queryTrap || "x-votehub-trap"
    });
    return next(new ApiError(400, "Invalid request payload", "INVALID_REQUEST_PAYLOAD"));
  }

  return next();
};

