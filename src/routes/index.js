import { Router } from "express";
import { getMongoHealth } from "../config/db.js";
import authRoutes from "./authRoutes.js";
import electionRoutes from "./electionRoutes.js";
import voteRoutes from "./voteRoutes.js";

const router = Router();

const buildHealthPayload = () => {
  const mongo = getMongoHealth();
  const uptimeSeconds = Number(process.uptime().toFixed(0));
  return {
    status: mongo.ready ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    mongo
  };
};

router.get("/health/live", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(0))
    }
  });
});

router.get("/health/ready", (req, res) => {
  const payload = buildHealthPayload();
  res.status(payload.mongo.ready ? 200 : 503).json({
    success: payload.mongo.ready,
    data: payload
  });
});

router.get("/health", (req, res) => {
  const payload = buildHealthPayload();
  res.status(payload.mongo.ready ? 200 : 503).json({
    success: payload.mongo.ready,
    data: payload
  });
});

router.use("/auth", authRoutes);
router.use("/elections", electionRoutes);
router.use("/votes", voteRoutes);

export default router;
