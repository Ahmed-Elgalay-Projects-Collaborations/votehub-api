import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import hpp from "hpp";
import mongoSanitize from "express-mongo-sanitize";
import corsMiddleware from "./config/cors.js";
import env from "./config/env.js";
import routes from "./routes/index.js";
import { metricsMiddleware, metricsRouteHandler } from "./config/metrics.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";
import { notFoundHandler } from "./middlewares/notFoundMiddleware.js";
import { requestContextMiddleware } from "./middlewares/requestContextMiddleware.js";
import { requestLoggerMiddleware } from "./middlewares/requestLoggerMiddleware.js";
import { sanitizeInputMiddleware } from "./middlewares/sanitizeInputMiddleware.js";
import { csrfHardeningMiddleware } from "./middlewares/csrfHardeningMiddleware.js";
import { apiRateLimiter } from "./middlewares/apiRateLimiter.js";

const app = express();

//app.disable("x-powered-by");


app.set("trust proxy", 1);

app.use(requestContextMiddleware);
app.use(metricsMiddleware);
app.use(requestLoggerMiddleware);

app.use(helmet());
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'PHP/8.2.0'); // Mimicking PHP
  next();
});
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: env.bodyLimit }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(hpp());
app.use(sanitizeInputMiddleware);
app.use(csrfHardeningMiddleware);
app.use("/api", apiRateLimiter);

if (env.enableMetrics) {
  app.get("/metrics", metricsRouteHandler);
}

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
