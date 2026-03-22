import { createHash, createHmac } from "crypto";
import env from "../config/env.js";
import AuditLogEntry from "../models/AuditLogEntry.js";
import { appLogger } from "../config/logger.js";
import { redactSensitiveData } from "../utils/redact.js";

const GENESIS_HASH = "GENESIS";
let appendQueue = Promise.resolve();

const sortObjectKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = sortObjectKeys(value[key]);
        return accumulator;
      }, {});
  }

  return value;
};

const canonicalize = (value) => JSON.stringify(sortObjectKeys(value));

const computeHash = (payload) =>
  createHash("sha256")
    .update(canonicalize(payload))
    .digest("hex");

const computeSignature = (payload) =>
  createHmac("sha256", env.auditSigningKey)
    .update(canonicalize(payload))
    .digest("hex");

const buildEntryPayload = (entry) => ({
  eventTimestamp: entry.eventTimestamp.toISOString(),
  actorId: entry.actorId,
  actorRole: entry.actorRole,
  eventType: entry.eventType,
  metadata: entry.metadata,
  requestId: entry.requestId,
  ip: entry.ip,
  userAgent: entry.userAgent,
  previousHash: entry.previousHash
});

const appendInternal = async ({ eventType, req, actorId = null, actorRole = null, metadata = {}, signAction = false }) => {
  const safeMetadata = redactSensitiveData(metadata);
  const lastEntry = await AuditLogEntry.findOne({}).sort({ eventTimestamp: -1, _id: -1 }).select("currentHash");
  const previousHash = lastEntry?.currentHash || GENESIS_HASH;

  const eventTimestamp = new Date();
  const entryPayload = buildEntryPayload({
    eventTimestamp,
    actorId: actorId || req?.user?.id || null,
    actorRole: actorRole || req?.user?.role || null,
    eventType,
    metadata: safeMetadata,
    requestId: req?.id || null,
    ip: req?.ip || null,
    userAgent: req?.headers?.["user-agent"] || null,
    previousHash
  });

  const currentHash = computeHash(entryPayload);
  const actionSignature = signAction
    ? computeSignature({
        eventType: entryPayload.eventType,
        actorId: entryPayload.actorId,
        actorRole: entryPayload.actorRole,
        timestamp: entryPayload.eventTimestamp,
        metadata: entryPayload.metadata
      })
    : null;

  return AuditLogEntry.create({
    ...entryPayload,
    eventTimestamp,
    currentHash,
    actionSignature
  });
};

export const appendAuditLog = async (params) => {
  appendQueue = appendQueue
    .then(() => appendInternal(params))
    .catch((error) => {
      appLogger.error("Failed to append audit log entry", {
        message: error.message
      });
      throw error;
    });

  return appendQueue;
};

export const appendSecurityAuditLog = async (eventType, req, metadata = {}) => {
  try {
    await appendAuditLog({
      eventType: `security.${eventType}`,
      req,
      metadata
    });
  } catch (error) {
    appLogger.error("Unable to append security audit log", {
      eventType,
      message: error.message
    });
  }
};

export const verifyAuditLogIntegrity = async ({ limit = 5000 } = {}) => {
  const entries = await AuditLogEntry.find({})
    .sort({ eventTimestamp: 1, _id: 1 })
    .limit(limit);

  let expectedPreviousHash = GENESIS_HASH;
  for (const entry of entries) {
    if (entry.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        checkedEntries: entries.length,
        failure: {
          entryId: entry.id,
          reason: "previous_hash_mismatch"
        }
      };
    }

    const recomputed = computeHash(
      buildEntryPayload({
        eventTimestamp: entry.eventTimestamp,
        actorId: entry.actorId || null,
        actorRole: entry.actorRole || null,
        eventType: entry.eventType,
        metadata: entry.metadata || {},
        requestId: entry.requestId || null,
        ip: entry.ip || null,
        userAgent: entry.userAgent || null,
        previousHash: entry.previousHash
      })
    );

    if (recomputed !== entry.currentHash) {
      return {
        valid: false,
        checkedEntries: entries.length,
        failure: {
          entryId: entry.id,
          reason: "current_hash_mismatch"
        }
      };
    }

    expectedPreviousHash = entry.currentHash;
  }

  return {
    valid: true,
    checkedEntries: entries.length,
    tailHash: expectedPreviousHash
  };
};

