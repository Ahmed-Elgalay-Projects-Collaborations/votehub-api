import fs from "fs";
import path from "path";
import { createLogger, format, transports } from "winston";
import env from "./env.js";
import { redactSensitiveData } from "../utils/redact.js";

const { combine, timestamp, errors, json, colorize, printf } = format;

const logDirectory = path.resolve(process.cwd(), env.logDir);
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const devFormat = combine(
  colorize(),
  timestamp(),
  printf(({ level, message, timestamp: time, ...meta }) => `${time} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`)
);

const jsonFormat = combine(timestamp(), errors({ stack: true }), json());

const buildLogger = (defaultMeta = {}, extraTransports = []) =>
  createLogger({
    level: env.nodeEnv === "production" ? "info" : "debug",
    defaultMeta,
    format: jsonFormat,
    transports: [
      new transports.File({ filename: path.join(logDirectory, "application-error.log"), level: "error" }),
      new transports.File({ filename: path.join(logDirectory, "application-combined.log") }),
      ...extraTransports
    ]
  });

export const appLogger = buildLogger({ source: "application" });

export const securityLogger = createLogger({
  level: "info",
  defaultMeta: { source: "security" },
  format: jsonFormat,
  transports: [new transports.File({ filename: path.join(logDirectory, "security.log") })]
});

if (env.nodeEnv !== "production") {
  appLogger.add(new transports.Console({ format: devFormat }));
  securityLogger.add(new transports.Console({ format: devFormat }));
}

export const logAppError = (message, metadata = {}) => {
  appLogger.error(message, redactSensitiveData(metadata));
};

export const logSecurity = (event, metadata = {}, level = "warn") => {
  securityLogger.log(level, event, redactSensitiveData(metadata));
};

