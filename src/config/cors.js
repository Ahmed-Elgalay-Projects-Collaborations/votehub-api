import cors from "cors";
import env from "./env.js";
import { ApiError } from "../utils/apiError.js";

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new ApiError(403, "Blocked by CORS policy", "CORS_BLOCKED"));
  },
  credentials: env.enableCookieAuth,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With"],
  maxAge: 86400
};

export default cors(corsOptions);
