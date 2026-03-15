import { emitScanLive } from "../realtime/scanLiveHub.js";
import { registrarVentaEnCajaSiHayActiva } from "../services/caja.service.js";

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

    try {
        await conn.beginTransaction();

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

            await conn.query(
                `DELETE FROM eco_scan_session_item
         WHERE session_id = ?`,
                [sessionId]
            );
        }

        if (normalizedItems.length > 0) {
            const values = normalizedItems.map((it) => [
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

        emitScanLive("scan_session_update", {
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
        await conn.rollback();
        console.error("syncScanSession error:", err);
        return res.status(500).json({ ok: false, error: "Error interno del servidor" });
    } finally {
        conn.release();
    }
}

export async function closeScanSession(req, res) {
    try {
        const pool = req.app.locals.pool;
        const operarioId = Number(req.user?.id);

        if (!operarioId) {
            return res.status(401).json({ ok: false, error: "No autenticado" });
        }

        const [[existing]] = await pool.query(
            `SELECT id, subtotal
       FROM eco_scan_session
       WHERE operario_id = ? AND estado = 'activa'
       ORDER BY id DESC
       LIMIT 1`,
            [operarioId]
        );

        if (!existing) {
            return res.json({ ok: true, data: { closed: false } });
        }

                await pool.query(
            `UPDATE eco_scan_session
       SET estado = 'cerrada', closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
            [existing.id]
        );

        const totalVenta = Number(existing.subtotal || 0);

        let cajaResult = null;
        if (totalVenta > 0) {
            cajaResult = await registrarVentaEnCajaSiHayActiva(pool, {
                operarioId,
                scanSessionId: Number(existing.id),
                totalVenta,
                descripcion: "Venta desde escaneo",
            });
        }

        emitScanLive("scan_session_closed", {
            operarioId,
            sessionId: Number(existing.id),
            closed_at: new Date().toISOString(),
        });

        return res.json({
            ok: true,
            data: {
                closed: true,
                sessionId: Number(existing.id),
                caja: cajaResult,
            },
        });
    } catch (err) {
        console.error("closeScanSession error:", err);
        return res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
}