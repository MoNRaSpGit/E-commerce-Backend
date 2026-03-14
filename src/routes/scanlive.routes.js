import { Router } from "express";
import { streamScanLive } from "../controllers/scanlive.stream.controller.js";
import {
  getCurrentScanSession,
  syncScanSession,
  closeScanSession,
} from "../controllers/scanlive.controller.js";
import { requireAuthSse } from "../middlewares/authSse.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

router.get(
  "/stream",
  requireAuthSse,
  requireRole("admin"),
  streamScanLive
);

router.get(
  "/current",
  requireAuth,
  requireRole("admin", "operario"),
  getCurrentScanSession
);

router.put(
  "/sync",
  requireAuth,
  requireRole("operario"),
  syncScanSession
);

router.post(
  "/close",
  requireAuth,
  requireRole("operario"),
  closeScanSession
);

export default router;