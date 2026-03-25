import dns from "dns";
import net from "net";
import nodemailer from "nodemailer";
import env from "../config/env.js";
import { appLogger } from "../config/logger.js";

let transporter = null;
const reservedEmailDomains = ["example.com", "example.org", "example.net", "invalid", "localhost", "test"];

export const isSmtpConfigured = () => Boolean(env.smtpHost && env.smtpUser && env.smtpPass);

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = createTransporter();
  }

  return transporter;
};

const createTransporter = ({ host = env.smtpHost, family = env.smtpIpFamily, tlsServername = undefined } = {}) => {
  const smtpOptions = {
    host,
    port: env.smtpPort,
    secure: env.smtpSecure,
    connectionTimeout: env.smtpConnectionTimeoutMs,
    greetingTimeout: env.smtpGreetingTimeoutMs,
    socketTimeout: env.smtpSocketTimeoutMs,
    dnsTimeout: env.smtpDnsTimeoutMs,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    }
  };

  if (family === 4 || family === 6) {
    smtpOptions.family = family;
  }

  if (tlsServername) {
    smtpOptions.tls = {
      ...(smtpOptions.tls || {}),
      servername: tlsServername
    };
  }

  return nodemailer.createTransport(smtpOptions);
};

const shouldRetryWithIpv4 = (error) => {
  if (!error) {
    return false;
  }
  const message = String(error.message || "");
  return error.code === "ENETUNREACH" || message.includes("ENETUNREACH");
};

const resolveIpv4Address = async (host) => {
  if (!host || net.isIP(host) === 4) {
    return host;
  }
  if (net.isIP(host) === 6) {
    return null;
  }

  const result = await dns.promises.lookup(host, { family: 4 });
  return result?.address || null;
};

const extractRecipientDomains = (to) => {
  const recipients = Array.isArray(to) ? to : String(to || "").split(",");
  return recipients
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .map((address) => {
      const atIndex = address.lastIndexOf("@");
      return atIndex >= 0 ? address.slice(atIndex + 1) : "";
    })
    .filter(Boolean);
};

const isReservedEmailDomain = (domain) =>
  reservedEmailDomains.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`));

export const sendEmail = async ({ to, subject, text, html }) => {
  const smtpTransporter = getTransporter();
  if (!smtpTransporter) {
    appLogger.warn("SMTP is not configured; email was not sent", {
      toMasked: to ? `${String(to).slice(0, 2)}***` : "unknown"
    });
    return { delivered: false };
  }

  const recipientDomains = extractRecipientDomains(to);
  if (recipientDomains.some(isReservedEmailDomain)) {
    appLogger.warn("Skipping outbound email to reserved test domain", {
      toMasked: to ? `${String(to).slice(0, 2)}***` : "unknown"
    });
    return { delivered: false, skipped: true };
  }

  const mail = {
    from: env.smtpFrom,
    to,
    subject,
    text,
    html
  };

  try {
    await smtpTransporter.sendMail(mail);
  } catch (error) {
    if (!shouldRetryWithIpv4(error)) {
      throw error;
    }

    const ipv4Host = await resolveIpv4Address(env.smtpHost);
    if (!ipv4Host) {
      throw error;
    }

    const fallbackTransporter = createTransporter({
      host: ipv4Host,
      family: 4,
      tlsServername: env.smtpHost
    });

    await fallbackTransporter.sendMail(mail);
    appLogger.warn("SMTP IPv6 route unavailable; email sent using IPv4 fallback", {
      smtpHost: env.smtpHost
    });
  }

  return { delivered: true };
};
