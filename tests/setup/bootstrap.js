import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "votehub_test_jwt_secret_key_which_is_long_enough_12345";
process.env.AUDIT_SIGNING_KEY = "votehub_test_audit_signing_key_which_is_long_enough_12345";
process.env.RECEIPT_SIGNING_KEY = "votehub_test_receipt_signing_key_which_is_long_enough_12345";
process.env.OTP_ENCRYPTION_KEY = "votehub_test_otp_encryption_key_which_is_long_enough_12345";
process.env.VOTE_ENCRYPTION_KEY = "votehub_test_vote_encryption_key_which_is_long_enough_12345";
process.env.AUDIT_SALT = "votehub_test_audit_salt_value";
process.env.ENABLE_COOKIE_AUTH = "true";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_SAMESITE = "lax";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.ENABLE_METRICS = "true";
process.env.LOG_DIR = "logs/test";
process.env.DEFAULT_ADMIN_EMAIL = "";
process.env.DEFAULT_ADMIN_PASSWORD = "";
process.env.LOGIN_MAX_FAILED_ATTEMPTS = "10";
process.env.LOGIN_LOCK_WINDOW_SECONDS = "900";
process.env.LOGIN_LOCK_MAX_SECONDS = "86400";
process.env.RISK_MEDIUM_THRESHOLD = "100";
process.env.RISK_HIGH_THRESHOLD = "150";
process.env.RISK_CRITICAL_THRESHOLD = "200";

before(async function beforeAll() {
  this.timeout(900000);

  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri("votehub_test");

  await mongoose.connect(process.env.MONGO_URI);

  const { default: app } = await import("../../src/app.js");
  globalThis.__TEST_APP = app;
});

beforeEach(async () => {
  const { collections } = mongoose.connection;
  const cleanups = Object.values(collections).map((collection) => collection.deleteMany({}));
  await Promise.all(cleanups);
});

after(async function afterAll() {
  this.timeout(120000);
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});
