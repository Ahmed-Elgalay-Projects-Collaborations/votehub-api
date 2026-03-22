import { randomUUID } from "crypto";

export const requestContextMiddleware = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};

