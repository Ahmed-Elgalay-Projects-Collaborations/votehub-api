import mongoose from "mongoose";
import env from "./env.js";
import { appLogger } from "./logger.js";

const connectionStateLabel = (readyState) => {
  switch (readyState) {
    case 0:
      return "disconnected";
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "unknown";
  }
};

let listenersRegistered = false;

const registerConnectionListeners = () => {
  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;

  mongoose.connection.on("disconnected", () => {
    appLogger.warn("MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    appLogger.info("MongoDB reconnected");
  });

  mongoose.connection.on("error", (error) => {
    appLogger.error("MongoDB connection error", {
      message: error.message
    });
  });
};

export const getMongoHealth = () => {
  const { readyState, host, name } = mongoose.connection;
  return {
    ready: readyState === 1,
    state: connectionStateLabel(readyState),
    host: host || null,
    database: name || null
  };
};

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", true);
    registerConnectionListeners();

    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: env.mongoServerSelectionTimeoutMs,
      socketTimeoutMS: env.mongoSocketTimeoutMs,
      maxPoolSize: env.mongoMaxPoolSize,
      minPoolSize: env.mongoMinPoolSize,
      autoIndex: env.nodeEnv !== "production"
    });

    appLogger.info("MongoDB connected", {
      host: conn.connection.host,
      name: conn.connection.name
    });
  } catch (error) {
    appLogger.error("Database connection error", {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.connection.close();
  appLogger.info("MongoDB connection closed");
};

export default connectDB;
