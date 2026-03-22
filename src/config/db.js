import mongoose from "mongoose";
import env from "./env.js";
import { appLogger } from "./logger.js";

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", true);

    const conn = await mongoose.connect(env.mongoUri);

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

export default connectDB;
