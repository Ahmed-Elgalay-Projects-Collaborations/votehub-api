import { Router } from "express";
import authRoutes from "./authRoutes.js";
import electionRoutes from "./electionRoutes.js";
import voteRoutes from "./voteRoutes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString()
    }
  });
});

router.use("/auth", authRoutes);
router.use("/elections", electionRoutes);
router.use("/votes", voteRoutes);

export default router;

