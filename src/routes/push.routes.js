import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { vapidPublicKey, subscribePush, testPushMe } from "../controllers/push.controller.js";

const router = Router();

// público: para que el front obtenga la clave pública VAPID
router.get("/vapid-public-key", vapidPublicKey);

// protegido: guardar subscripción del usuario logueado
router.post("/subscribe", requireAuth, subscribePush);

// protegido: test -> manda push a MIS dispositivos
router.post("/test/me", requireAuth, testPushMe);

export default router;
