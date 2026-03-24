import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false
    },
    role: {
      type: String,
      enum: ["voter", "admin"],
      default: "voter"
    },
    canCreatePolls: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerifiedAt: {
      type: Date,
      default: null
    },
    otpEnabled: {
      type: Boolean,
      default: false
    },
    otpSecretEncrypted: {
      type: String,
      default: "",
      select: false
    },
    otpTempSecretEncrypted: {
      type: String,
      default: "",
      select: false
    },
    otpRecoveryCodes: {
      type: [String],
      default: [],
      select: false
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    lastLoginIp: {
      type: String,
      default: null
    },
    lastLoginUserAgent: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this.id,
    fullName: this.fullName,
    email: this.email,
    role: this.role,
    canCreatePolls: this.role === "admin" ? true : this.canCreatePolls,
    isActive: this.isActive,
    emailVerified: this.emailVerified,
    otpEnabled: this.otpEnabled || this.role === "admin",
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model("User", userSchema);
export default User;
