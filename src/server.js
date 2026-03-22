import app from "./app.js";
import connectDB from "./config/db.js";
import env from "./config/env.js";
import { appLogger } from "./config/logger.js";
import { ensureDefaultAdmin } from "./services/authService.js";

const bootstrap = async () => {
  await connectDB();
  await ensureDefaultAdmin();

  const server = app.listen(env.port, () => {
    appLogger.info("Server started", {
      port: env.port,
      environment: env.nodeEnv
    });
  });

  const shutdown = (signal) => {
    appLogger.info("Shutdown signal received", { signal });
    server.close(() => {
      appLogger.info("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

bootstrap().catch((error) => {
  appLogger.error("Server bootstrap failed", {
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
