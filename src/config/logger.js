import fs from "fs";
import path from "path";
import { createLogger, format, transports } from "winston";
import { redactSensitiveData } from "../utils/redact.js";

const { combine, timestamp, errors, json, colorize, printf } = format;

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
};

const nodeEnv = process.env.NODE_ENV || "development";
const logDir = process.env.LOG_DIR || "logs";
const logToConsole = parseBoolean(process.env.LOG_TO_CONSOLE, true);
const logToFile = parseBoolean(process.env.LOG_TO_FILE, true);

const logDirectory = path.resolve(process.cwd(), logDir);
if (logToFile && !fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const devFormat = combine(
  colorize(),
  timestamp(),
  printf(({ level, message, timestamp: time, ...meta }) => `${time} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`)
);

const jsonFormat = combine(timestamp(), errors({ stack: true }), json());

const buildConsoleTransport = () =>
  new transports.Console({
    format: nodeEnv === "production" ? jsonFormat : devFormat
  });

const buildLogger = (defaultMeta = {}, extraTransports = []) => {
  const configuredTransports = [...extraTransports];

  if (logToFile) {
    configuredTransports.unshift(
      new transports.File({ filename: path.join(logDirectory, "application-error.log"), level: "error" }),
      new transports.File({ filename: path.join(logDirectory, "application-combined.log") })
    );
  }

  if (logToConsole) {
    configuredTransports.push(buildConsoleTransport());
  }

  return createLogger({
    level: nodeEnv === "production" ? "info" : "debug",
    defaultMeta,
    format: jsonFormat,
    transports: configuredTransports
  });
};

export const appLogger = buildLogger({ source: "application" });

export const securityLogger = createLogger({
  level: "info",
  defaultMeta: { source: "security" },
  format: jsonFormat,
  transports: [
    ...(logToFile ? [new transports.File({ filename: path.join(logDirectory, "security.log") })] : []),
    ...(logToConsole ? [buildConsoleTransport()] : [])
  ]
});

export const logAppError = (message, metadata = {}) => {
  appLogger.error(message, redactSensitiveData(metadata));
};

export const logSecurity = (event, metadata = {}, level = "warn") => {
  securityLogger.log(level, event, redactSensitiveData(metadata));
};

