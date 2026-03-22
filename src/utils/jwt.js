import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import env from "../config/env.js";

export const signAccessToken = (payload) =>
  jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret);

export const signOtpChallengeToken = (payload) =>
  jwt.sign(
    {
      ...payload,
      type: "otp_challenge",
      jti: randomUUID()
    },
    env.jwtSecret,
    {
      expiresIn: env.otpChallengeExpiresIn
    }
  );

export const verifyOtpChallengeToken = (token) => {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.type !== "otp_challenge") {
    throw new Error("Invalid OTP challenge token");
  }
  return payload;
};

export const signAdminStepUpToken = (payload) =>
  jwt.sign(
    {
      ...payload,
      type: "admin_step_up",
      jti: randomUUID()
    },
    env.jwtSecret,
    {
      expiresIn: env.adminStepUpExpiresIn
    }
  );

export const verifyAdminStepUpToken = (token) => {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.type !== "admin_step_up") {
    throw new Error("Invalid admin step-up token");
  }
  return payload;
};
