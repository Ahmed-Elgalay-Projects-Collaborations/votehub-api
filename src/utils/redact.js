const SENSITIVE_KEYS = [
  "password",
  "email",
  "fullname",
  "token",
  "authorization",
  "cookie",
  "secret",
  "jwt",
  "accessToken",
  "refreshToken"
];

const isSensitiveKey = (key) => SENSITIVE_KEYS.some((pattern) => key.toLowerCase().includes(pattern.toLowerCase()));

export const redactSensitiveData = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((accumulator, [key, itemValue]) => {
      if (isSensitiveKey(key)) {
        accumulator[key] = "[REDACTED]";
      } else {
        accumulator[key] = redactSensitiveData(itemValue);
      }
      return accumulator;
    }, {});
  }

  return value;
};
