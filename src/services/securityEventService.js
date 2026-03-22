import { incrementSecurityMetric } from "../config/metrics.js";
import { logSecurity } from "../config/logger.js";

export const logSecurityEvent = (event, req, metadata = {}, level = "warn") => {
  incrementSecurityMetric(event);
  logSecurity(
    event,
    {
      requestId: req?.id,
      method: req?.method,
      path: req?.originalUrl,
      ip: req?.ip,
      userId: req?.user?.id || null,
      userAgent: req?.headers?.["user-agent"] || null,
      ...metadata
    },
    level
  );
};

