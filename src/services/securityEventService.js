import { incrementSecurityMetric } from "../config/metrics.js";
import { logSecurity } from "../config/logger.js";
import { appendSecurityAuditLog } from "./auditLogService.js";
import { recordRiskEvent } from "./riskScoringService.js";

export const logSecurityEvent = (event, req, metadata = {}, level = "warn") => {
  incrementSecurityMetric(event);
  recordRiskEvent({
    eventType: event,
    ip: req?.ip,
    userId: req?.user?.id || metadata?.userId || null
  });

  appendSecurityAuditLog(event, req, metadata).catch(() => {});

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
