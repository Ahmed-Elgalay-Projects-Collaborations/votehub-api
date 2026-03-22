import mongoose from "mongoose";

const auditLogEntrySchema = new mongoose.Schema(
  {
    eventTimestamp: {
      type: Date,
      required: true,
      index: true
    },
    actorId: {
      type: String,
      default: null,
      index: true
    },
    actorRole: {
      type: String,
      default: null
    },
    eventType: {
      type: String,
      required: true,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    requestId: {
      type: String,
      default: null
    },
    ip: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    previousHash: {
      type: String,
      required: true
    },
    currentHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    actionSignature: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const immutableOperation = () => {
  throw new Error("Audit log is append-only and cannot be modified.");
};

auditLogEntrySchema.pre("updateOne", immutableOperation);
auditLogEntrySchema.pre("findOneAndUpdate", immutableOperation);
auditLogEntrySchema.pre("deleteOne", immutableOperation);
auditLogEntrySchema.pre("findOneAndDelete", immutableOperation);
auditLogEntrySchema.pre("deleteMany", immutableOperation);

const AuditLogEntry = mongoose.model("AuditLogEntry", auditLogEntrySchema);
export default AuditLogEntry;

