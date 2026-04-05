import { Router } from "express";
import { getRankingTop } from "../controllers/ranking.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

router.get(
  "/top",
  requireAuth,
  requireRole("admin"),
  getRankingTop
);

export default router;