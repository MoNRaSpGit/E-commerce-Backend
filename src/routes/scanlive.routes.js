import { Router } from "express";
import { streamScanLive } from "../controllers/scanlive.stream.controller.js";
import { requireAuthSse } from "../middlewares/authSse.js";
import { requireRole } from "../middlewares/auth.js";

const router = Router();

router.get(
  "/stream",
  requireAuthSse,
  requireRole("admin"),
  streamScanLive
);

export default router;