import { emitScanLive } from "../realtime/scanLiveHub.js";
import { emitCaja } from "../realtime/cajaHub.js";
import { getCajaRealtimeSnapshot, registrarVentaEnCajaActivaEnConexion } from "../services/caja.service.js";
import { performance } from "node:perf_hooks";

function normalizeItems(items) {
    if (!Array.isArray(items)) return [];

    return items
        .map((it, index) => {
            const productoIdRaw = Number(it?.productoId);
            const productoId = Number.isFinite(productoIdRaw) && productoIdRaw > 0
                ? productoIdRaw
                : null;

            const nombre = String(it?.nombre_snapshot || it?.name || "").trim();
            const precio = Number(it?.precio_unitario_snapshot ?? it?.price ?? 0);
            const cantidad = Math.max(1, Number(it?.cantidad ?? it?.qty ?? 1));

            if (!nombre || !Number.isFinite(precio) || precio < 0) return null;

            return {
                producto_id: productoId,
                nombre_snapshot: nombre,
                precio_unitario_snapshot: Number(precio.toFixed(2)),
                cantidad: Math.floor(cantidad),
                subtotal: Number((precio * cantidad).toFixed(2)),
                orden: index + 1,
            };
        })
        .filter(Boolean);
}

function getSyncItemKey(item) {
    if (item.producto_id) {
        return `p:${item.producto_id}`;
    }

    return `n:${String(item.nombre_snapshot || "").trim().toLowerCase()}`;
}

async function processDeferredScanSessionClose(pool, { operarioId, sessionId, totalVenta }) {
    const startedAt = performance.now();
    const timings = {};
    const mark = (label, from) => {
        timings[label] = Number((performance.now() - from).toFixed(2));
    };

    try {
        const loadItemsStartedAt = performance.now();
        const [items] = await pool.query(
            `SELECT producto_id, cantidad
       FROM eco_scan_session_item
       WHERE session_id = ?`,
            [sessionId]
        );
        mark("leer_items_ms", loadItemsStartedAt);

        const today = new Date().toISOString().slice(0, 10);
        const rankingByProduct = new Map();

        for (const item of items) {
            const productoId = Number(item.producto_id);
            if (!productoId) continue;

            const cantidad = Number(item.cantidad || 0);
            rankingByProduct.set(
                productoId,
                Number(rankingByProduct.get(productoId) || 0) + cantidad
            );
        }

        const rankingStartedAt = performance.now();
        if (rankingByProduct.size > 0) {
            const values = [...rankingByProduct.entries()].map(([productoId, cantidadTotal]) => [
                productoId,
                today,
                cantidadTotal,
            ]);

            await pool.query(
                `INSERT INTO eco_ranking_producto_dia (producto_id, fecha, cantidad_total)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           cantidad_total = cantidad_total + VALUES(cantidad_total)`,
                [values]
            );
        }
        mark("actualizar_ranking_ms", rankingStartedAt);

        const emitStartedAt = performance.now();
        const closedAt = new Date().toISOString();
        emitScanLive("scan_session_closed", {
            operarioId,
            sessionId: Number(sessionId),
            closed_at: closedAt,
        });
        emitCaja("scanlive_updated", {
            type: "scan_session_closed",
            operarioId,
            sessionId: Number(sessionId),
            totalVenta,
            closed_at: closedAt,
        });
        mark("emit_scanlive_ms", emitStartedAt);

        timings.total_ms = Number((performance.now() - startedAt).toFixed(2));
        console.info("[scanlive.close.deferred] timing", {
            operarioId,
            sessionId: Number(sessionId),
            itemsCount: items.length,
            rankingProductsCount: rankingByProduct.size,
            totalVenta,
            ...timings,
        });
    } catch (err) {
        console.error("processDeferredScanSessionClose error:", {
            operarioId,
            sessionId,
            err,
        });
    }
}

export async function getCurrentScanSession(req, res) {
    try {
        const pool = req.app.locals.pool;

        const requestedOperarioId = Number(req.query?.operario_id || 0);
        const isAdmin = req.user?.rol === "admin";

        let session;

        if (requestedOperarioId > 0) {
            const [rows] = await pool.query(
                `SELECT
           id,
           operario_id,
           estado,
           total_items,
           total_unidades,
           subtotal,
           started_at,
           updated_at,
           closed_at
         FROM eco_scan_session
         WHERE operario_id = ? AND estado = 'activa'
         ORDER BY id DESC
         LIMIT 1`,
                [requestedOperarioId]
            );
            session = rows?.[0] || null;
        } else if (isAdmin) {
            const [rows] = await pool.query(
                `SELECT
           id,
           operario_id,
           estado,
           total_items,
           total_unidades,
           subtotal,
           started_at,
           updated_at,
           closed_at
         FROM eco_scan_session
         WHERE estado = 'activa'
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
            );
            session = rows?.[0] || null;
        } else {
            const [rows] = await pool.query(
                `SELECT
           id,
           operario_id,
           estado,
           total_items,
           total_unidades,
           subtotal,
           started_at,
           updated_at,
           closed_at
         FROM eco_scan_session
         WHERE operario_id = ? AND estado = 'activa'
         ORDER BY id DESC
         LIMIT 1`,
                [req.user.id]
            );
            session = rows?.[0] || null;
        }

        if (!session) {
            return res.json({ ok: true, data: null });
        }

        const [items] = await pool.query(
            `SELECT
         id,
         session_id,
         producto_id,
         nombre_snapshot,
         precio_unitario_snapshot,
         cantidad,
         subtotal,
         orden,
         created_at,
         updated_at
       FROM eco_scan_session_item
       WHERE session_id = ?
       ORDER BY orden ASC, id ASC`,
            [session.id]
        );

        return res.json({
            ok: true,
            data: {
                ...session,
                items,
            },
        });
    } catch (err) {
        console.error("getCurrentScanSession error:", err);
        return res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
}

export async function syncScanSession(req, res) {
    const pool = req.app.locals.pool;
    const operarioId = Number(req.user?.id);

    if (!operarioId) {
        return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    const normalizedItems = normalizeItems(req.body?.items);
    const totalItems = normalizedItems.length;
    const totalUnidades = normalizedItems.reduce((acc, it) => acc + it.cantidad, 0);
    const subtotal = Number(
        normalizedItems.reduce((acc, it) => acc + Number(it.subtotal || 0), 0).toFixed(2)
    );

    const conn = await pool.getConnection();
    let transactionOpen = false;

    try {
        await conn.beginTransaction();
        transactionOpen = true;

        const [[existing]] = await conn.query(
            `SELECT id
       FROM eco_scan_session
       WHERE operario_id = ? AND estado = 'activa'
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
            [operarioId]
        );

        let sessionId = existing?.id || null;

        if (!sessionId) {
            const [ins] = await conn.query(
                `INSERT INTO eco_scan_session
          (operario_id, estado, total_items, total_unidades, subtotal)
         VALUES (?, 'activa', ?, ?, ?)`,
                [operarioId, totalItems, totalUnidades, subtotal]
            );

            sessionId = ins.insertId;
        } else {
            await conn.query(
                `UPDATE eco_scan_session
         SET total_items = ?, total_unidades = ?, subtotal = ?, updated_at = NOW()
         WHERE id = ?`,
                [totalItems, totalUnidades, subtotal, sessionId]
            );
        }

        const [currentItems] = await conn.query(
            `SELECT id, producto_id, nombre_snapshot, precio_unitario_snapshot, cantidad, subtotal, orden
       FROM eco_scan_session_item
       WHERE session_id = ?`,
            [sessionId]
        );

        const currentByKey = new Map();
        const deleteIds = new Set(currentItems.map((item) => {
            const key = getSyncItemKey(item);
            currentByKey.set(key, item);
            return item.id;
        }));

        const inserts = [];
        const updates = [];

        for (const item of normalizedItems) {
            const key = getSyncItemKey(item);
            const existingItem = currentByKey.get(key);

            if (existingItem) {
                deleteIds.delete(existingItem.id);

                const needsUpdate =
                    existingItem.nombre_snapshot !== item.nombre_snapshot ||
                    Number(existingItem.precio_unitario_snapshot) !== item.precio_unitario_snapshot ||
                    Number(existingItem.cantidad) !== item.cantidad ||
                    Number(existingItem.subtotal) !== item.subtotal ||
                    Number(existingItem.orden) !== item.orden;

                if (needsUpdate) {
                    updates.push({ ...item, id: existingItem.id });
                }
            } else {
                inserts.push(item);
            }
        }

        if (deleteIds.size > 0) {
            await conn.query(
                `DELETE FROM eco_scan_session_item
         WHERE id IN (?)`,
                [[...deleteIds]]
            );
        }

        if (updates.length > 0) {
            for (const item of updates) {
                await conn.query(
                    `UPDATE eco_scan_session_item
           SET producto_id = ?, nombre_snapshot = ?, precio_unitario_snapshot = ?, cantidad = ?, subtotal = ?, orden = ?, updated_at = NOW()
           WHERE id = ?`,
                    [
                        item.producto_id,
                        item.nombre_snapshot,
                        item.precio_unitario_snapshot,
                        item.cantidad,
                        item.subtotal,
                        item.orden,
                        item.id,
                    ]
                );
            }
        }

        if (inserts.length > 0) {
            const values = inserts.map((it) => [
                sessionId,
                it.producto_id,
                it.nombre_snapshot,
                it.precio_unitario_snapshot,
                it.cantidad,
                it.subtotal,
                it.orden,
            ]);

            await conn.query(
                `INSERT INTO eco_scan_session_item
          (session_id, producto_id, nombre_snapshot, precio_unitario_snapshot, cantidad, subtotal, orden)
         VALUES ?`,
                [values]
            );
        }

        await conn.commit();
        transactionOpen = false;

        emitScanLive("scan_session_update", {
            operarioId,
            sessionId: Number(sessionId),
            total_items: totalItems,
            total_unidades: totalUnidades,
            subtotal,
            updated_at: new Date().toISOString(),
        });
        emitCaja("scanlive_updated", {
            type: "scan_session_update",
            operarioId,
            sessionId: Number(sessionId),
            total_items: totalItems,
            total_unidades: totalUnidades,
            subtotal,
            updated_at: new Date().toISOString(),
        });

        return res.json({
            ok: true,
            data: {
                sessionId: Number(sessionId),
                total_items: totalItems,
                total_unidades: totalUnidades,
                subtotal,
            },
        });
    } catch (err) {
        if (transactionOpen) {
            await conn.rollback();
        }
        console.error("syncScanSession error:", err);
        return res.status(500).json({ ok: false, error: "Error interno del servidor" });
    } finally {
        conn.release();
    }
}

export async function closeScanSession(req, res) {
    const pool = req.app.locals.pool;
    const conn = await pool.getConnection();
    let transactionOpen = false;

    try {
        const operarioId = Number(req.user?.id);
        const startedAt = performance.now();
        const timings = {};
        const mark = (label, from) => {
            timings[label] = Number((performance.now() - from).toFixed(2));
        };

        if (!operarioId) {
            return res.status(401).json({ ok: false, error: "No autenticado" });
        }

        const beginTxStartedAt = performance.now();
        await conn.beginTransaction();
        transactionOpen = true;
        mark("begin_transaction_ms", beginTxStartedAt);

        const findSessionStartedAt = performance.now();
        const [[existing]] = await conn.query(
            `SELECT id, subtotal
       FROM eco_scan_session
       WHERE operario_id = ? AND estado = 'activa'
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
            [operarioId]
        );
        mark("buscar_session_activa_ms", findSessionStartedAt);

        if (!existing) {
            const commitStartedAt = performance.now();
            await conn.commit();
            transactionOpen = false;
            mark("commit_ms", commitStartedAt);
            timings.total_ms = Number((performance.now() - startedAt).toFixed(2));
            console.info("[scanlive.close] timing", {
                operarioId,
                sessionId: null,
                ...timings,
            });
            return res.json({ ok: true, data: { closed: false } });
        }

        const closeSessionStartedAt = performance.now();
        await conn.query(
            `UPDATE eco_scan_session
       SET estado = 'cerrada', closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
            [existing.id]
        );
        mark("cerrar_session_ms", closeSessionStartedAt);

        const totalVenta = Number(existing.subtotal || 0);

        let cajaResult = null;
        let cajaTimings = null;
        if (totalVenta > 0) {
            const cajaStartedAt = performance.now();
            cajaResult = await registrarVentaEnCajaActivaEnConexion(conn, {
                operarioId,
                scanSessionId: Number(existing.id),
                totalVenta,
                descripcion: "Venta desde escaneo",
                onTiming: (serviceTimings) => {
                    cajaTimings = serviceTimings;
                },
            });
            mark("registrar_caja_ms", cajaStartedAt);
        }

        const commitStartedAt = performance.now();
        await conn.commit();
        transactionOpen = false;
        mark("commit_ms", commitStartedAt);

        timings.total_ms = Number((performance.now() - startedAt).toFixed(2));
        console.info("[scanlive.close] timing", {
            operarioId,
            sessionId: Number(existing.id),
            totalVenta,
            ...timings,
            caja: cajaTimings,
        });

        setImmediate(() => {
            if (cajaResult && !cajaResult.skipped) {
                void (async () => {
                    try {
                        const snapshot = await getCajaRealtimeSnapshot(pool, {
                            movimientosLimit: 10,
                        });

                        emitCaja("caja_updated", {
                            type: "venta",
                            cajaId: cajaResult.cajaId || snapshot.caja?.id || null,
                            scanSessionId: Number(existing.id),
                            at: new Date().toISOString(),
                            refresh: true,
                            caja: snapshot.caja,
                            movimientos: snapshot.movimientos,
                            resumen_hoy: snapshot.resumen_hoy,
                        });
                    } catch (err) {
                        console.error("emit caja_updated snapshot error:", err);
                        emitCaja("caja_updated", {
                            type: "venta",
                            cajaId: cajaResult.cajaId || null,
                            scanSessionId: Number(existing.id),
                            at: new Date().toISOString(),
                            refresh: true,
                        });
                    }
                })();
            }

            void processDeferredScanSessionClose(pool, {
                operarioId,
                sessionId: Number(existing.id),
                totalVenta,
            });
        });

        return res.json({
            ok: true,
            data: {
                closed: true,
                sessionId: Number(existing.id),
                caja: cajaResult,
                timings,
                deferred: {
                    status: "scheduled",
                },
            },
        });
    } catch (err) {
        if (transactionOpen) {
            await conn.rollback();
        }
        console.error("closeScanSession error:", err);
        return res.status(500).json({ ok: false, error: "Error interno del servidor" });
    } finally {
        conn.release();
    }
}
