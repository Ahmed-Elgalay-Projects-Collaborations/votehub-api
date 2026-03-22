import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import env from "../config/env.js";

const buildEncryptionKey = (providedKey, fallbackValue) => {
  if (providedKey) {
    const trimmed = providedKey.trim();
    if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, "hex");
    }
    return createHash("sha256").update(trimmed).digest();
  }

  return createHash("sha256").update(fallbackValue).digest();
};

const otpEncryptionKey = buildEncryptionKey(env.otpEncryptionKey, env.jwtSecret);
const voteEncryptionKey = buildEncryptionKey(env.voteEncryptionKey || env.otpEncryptionKey, `${env.jwtSecret}:vote`);

const getEncryptionKey = (context = "otp") => {
  if (context === "vote") {
    return voteEncryptionKey;
  }

  return otpEncryptionKey;
};

export const hashValue = (value) =>
  createHash("sha256")
    .update(`${value}:${env.auditSalt}`)
    .digest("hex");

export const createRandomToken = (size = 32) => randomBytes(size).toString("hex");

export const encryptSecret = (plainText) => {
  if (!plainText) {
    return "";
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey("otp"), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptSecret = (encryptedValue) => {
  if (!encryptedValue) {
    return "";
  }

  const [ivB64, tagB64, contentB64] = encryptedValue.split(":");
  if (!ivB64 || !tagB64 || !contentB64) {
    return "";
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encryptedContent = Buffer.from(contentB64, "base64");

  try {
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey("otp"), iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    return "";
  }
};

export const encryptJson = (value, context = "vote") => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(context), iv);
  const payload = JSON.stringify(value ?? null);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptJson = (encryptedValue, context = "vote") => {
  if (!encryptedValue) {
    return null;
  }

  const [ivB64, tagB64, contentB64] = String(encryptedValue).split(":");
  if (!ivB64 || !tagB64 || !contentB64) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(context),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));

    const decrypted = Buffer.concat([decipher.update(Buffer.from(contentB64, "base64")), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch (error) {
    return null;
  }
};
