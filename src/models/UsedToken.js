import mongoose from "mongoose";

const usedTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      index: true
    },
    tokenType: {
      type: String,
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

usedTokenSchema.index({ tokenHash: 1, tokenType: 1 }, { unique: true });
usedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const UsedToken = mongoose.model("UsedToken", usedTokenSchema);
export default UsedToken;
