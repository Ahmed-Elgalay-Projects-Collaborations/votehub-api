import nodemailer from "nodemailer";
import env from "../config/env.js";
import { appLogger } from "../config/logger.js";

let transporter = null;

export const isSmtpConfigured = () => Boolean(env.smtpHost && env.smtpUser && env.smtpPass);

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }

  return transporter;
};

export const sendEmail = async ({ to, subject, text, html }) => {
  const smtpTransporter = getTransporter();
  if (!smtpTransporter) {
    appLogger.warn("SMTP is not configured; email was not sent", {
      toMasked: to ? `${String(to).slice(0, 2)}***` : "unknown"
    });
    return { delivered: false };
  }

  await smtpTransporter.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text,
    html
  });

  return { delivered: true };
};
