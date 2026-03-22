import xss from "xss";
import { logSecurityEvent } from "../services/securityEventService.js";

const SKIPPED_FIELDS = new Set(["password", "newPassword", "currentPassword"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const sanitizeString = (value) => {
  return xss(value, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script"]
  });
};

const sanitizeValue = (value, keyPath, changes) => {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, `${keyPath}[${index}]`, changes));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
      if (FORBIDDEN_KEYS.has(key)) {
        changes.push({ field: `${keyPath}.${key}`, reason: "forbidden_key" });
        return accumulator;
      }

      const nextPath = keyPath ? `${keyPath}.${key}` : key;
      accumulator[key] = sanitizeValue(nestedValue, nextPath, changes);
      return accumulator;
    }, {});
  }

  if (typeof value === "string") {
    const fieldName = keyPath.split(".").pop();
    if (SKIPPED_FIELDS.has(fieldName)) {
      return value;
    }

    const sanitized = sanitizeString(value);
    if (sanitized !== value) {
      changes.push({ field: keyPath, reason: "xss_sanitized" });
    }
    return sanitized;
  }

  return value;
};

export const sanitizeInputMiddleware = (req, res, next) => {
  const changes = [];

  req.body = sanitizeValue(req.body, "body", changes);
  req.query = sanitizeValue(req.query, "query", changes);
  req.params = sanitizeValue(req.params, "params", changes);

  if (changes.length > 0) {
    logSecurityEvent("suspicious_input_sanitized", req, {
      changes: changes.slice(0, 25)
    });
  }

  next();
};
