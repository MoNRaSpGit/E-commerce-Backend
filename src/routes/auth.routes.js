import { Router } from "express";
import { login, logout, me, refresh } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refresh);

// protegido
router.get("/me", requireAuth, me);

export default router;
