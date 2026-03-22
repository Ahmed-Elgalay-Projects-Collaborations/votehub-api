import { randomBytes } from "crypto";
import env from "../config/env.js";

const baseCookieOptions = {
  secure: env.cookieSecure,
  sameSite: env.cookieSameSite,
  path: "/"
};

const authCookieOptions = {
  ...baseCookieOptions,
  httpOnly: true,
  maxAge: env.authCookieMaxAgeMs
};

const csrfCookieOptions = {
  ...baseCookieOptions,
  httpOnly: false,
  maxAge: env.csrfCookieMaxAgeMs
};

export const createCsrfToken = () => randomBytes(32).toString("hex");

export const setAuthCookies = (res, accessToken, csrfToken) => {
  res.cookie(env.authCookieName, accessToken, authCookieOptions);
  res.cookie(env.csrfCookieName, csrfToken, csrfCookieOptions);
};

export const clearAuthCookies = (res) => {
  res.clearCookie(env.authCookieName, baseCookieOptions);
  res.clearCookie(env.csrfCookieName, baseCookieOptions);
};

export const setCsrfCookie = (res, csrfToken) => {
  res.cookie(env.csrfCookieName, csrfToken, csrfCookieOptions);
};
