import client from "prom-client";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry]
});

const securityEventsCounter = new client.Counter({
  name: "security_events_total",
  help: "Count of security events by type",
  labelNames: ["event"],
  registers: [registry]
});

export const incrementSecurityMetric = (event) => {
  securityEventsCounter.inc({ event });
};

export const metricsMiddleware = (req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path || req.baseUrl || req.path;
    end({
      method: req.method,
      route,
      status_code: String(res.statusCode)
    });
  });
  next();
};

export const metricsRouteHandler = async (req, res, next) => {
  try {
    res.setHeader("Content-Type", registry.contentType);
    res.status(200).send(await registry.metrics());
  } catch (error) {
    next(error);
  }
};

