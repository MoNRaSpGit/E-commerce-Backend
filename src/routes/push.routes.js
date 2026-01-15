import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import {
  vapidPublicKey,
  subscribePush,
  unsubscribePush,
  myPushSubs,
  testPushMe,
} from "../controllers/push.controller.js";


const router = Router();

// público: para que el front obtenga la clave pública VAPID
router.get("/vapid-public-key", vapidPublicKey);

// protegido: ver mis subs (debug)
router.get("/me", requireAuth, myPushSubs);

// protegido: guardar subscripción del usuario logueado (upsert por endpoint)
router.post("/subscribe", requireAuth, subscribePush);

// protegido: borrar subscripción por endpoint (logout / cleanup)
router.post("/unsubscribe", requireAuth, unsubscribePush);

// protegido: test -> manda push a MIS dispositivos
router.post("/test/me", requireAuth, testPushMe);


export default router;
