import app from "./app.js";
import connectDB, { disconnectDB } from "./config/db.js";
import env from "./config/env.js";
import { appLogger } from "./config/logger.js";
import { ensureDefaultAdmin } from "./services/authService.js";
import { isSmtpConfigured } from "./services/emailService.js";

const bootstrap = async () => {
  await connectDB();
  await ensureDefaultAdmin();

  const server = app.listen(env.port, () => {
    appLogger.info("Server started", {
      port: env.port,
      environment: env.nodeEnv
    });

    appLogger.info("Mail configuration status", {
      smtpConfigured: isSmtpConfigured()
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    appLogger.info("Shutdown signal received", { signal });
    server.close(async () => {
      appLogger.info("HTTP server closed");
      try {
        await disconnectDB();
      } catch (error) {
        appLogger.error("Error while closing database connection during shutdown", {
          message: error.message
        });
      } finally {
        process.exit(0);
      }
    });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch(() => process.exit(1));
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch(() => process.exit(1));
  });
};

bootstrap().catch((error) => {
  appLogger.error("Server bootstrap failed", {
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
