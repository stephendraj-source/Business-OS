import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/calendar-events", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const role: string = auth?.role ?? "user";

    const rows = await db.execute(
      role === "superuser"
        ? sql`SELECT * FROM calendar_events ORDER BY start_time ASC`
        : sql`SELECT * FROM calendar_events WHERE tenant_id = ${tenantId} ORDER BY start_time ASC`
    );
    res.json(rows.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/calendar-events", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const userId: number | null = auth?.userId ?? null;

    const { title, description, start_time, end_time, all_day, location, color } = req.body;
    if (!title || !start_time) {
      return res.status(400).json({ error: "title and start_time are required" });
    }

    const rows = await db.execute(sql`
      INSERT INTO calendar_events
        (tenant_id, title, description, start_time, end_time, all_day, location, color, created_by, updated_at)
      VALUES
        (${tenantId}, ${title}, ${description ?? null}, ${start_time}, ${end_time ?? null},
         ${all_day ?? false}, ${location ?? null}, ${color ?? '#10b981'}, ${userId}, NOW())
      RETURNING *
    `);
    res.status(201).json(rows.rows[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────
router.patch("/calendar-events/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const role: string = auth?.role ?? "user";
    const id = Number(req.params.id);

    const { title, description, start_time, end_time, all_day, location, color } = req.body;

    const rows = await db.execute(sql`
      UPDATE calendar_events
      SET
        title = COALESCE(${title ?? null}, title),
        description = ${description ?? null},
        start_time = COALESCE(${start_time ?? null}, start_time),
        end_time = ${end_time ?? null},
        all_day = COALESCE(${all_day ?? null}, all_day),
        location = ${location ?? null},
        color = COALESCE(${color ?? null}, color),
        updated_at = NOW()
      WHERE id = ${id}
        ${role !== "superuser" ? sql`AND tenant_id = ${tenantId}` : sql``}
      RETURNING *
    `);

    if (!rows.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows.rows[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/calendar-events/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const role: string = auth?.role ?? "user";
    const id = Number(req.params.id);

    const rows = await db.execute(sql`
      DELETE FROM calendar_events
      WHERE id = ${id}
        ${role !== "superuser" ? sql`AND tenant_id = ${tenantId}` : sql``}
      RETURNING id
    `);

    if (!rows.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
