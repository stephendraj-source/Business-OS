import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── GET /strategy — fetch mission, vision, purpose for this tenant ─────────────
router.get("/strategy", async (req, res) => {
  try {
    const tenantId = (req as any).auth?.tenantId ?? null;
    const result = await db.execute(
      sql`SELECT mission, vision, purpose, updated_at
          FROM tenant_strategy
          WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`}
          LIMIT 1`
    );
    const row = (result.rows as any[])[0];
    res.json(row ?? { mission: "", vision: "", purpose: "" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /strategy — upsert mission, vision, purpose ────────────────────────────
router.put("/strategy", async (req, res) => {
  try {
    const tenantId = (req as any).auth?.tenantId ?? null;
    const { mission = "", vision = "", purpose = "" } = req.body as Record<string, string>;
    const result = await db.execute(
      sql`INSERT INTO tenant_strategy (tenant_id, mission, vision, purpose, updated_at)
          VALUES (${tenantId}, ${String(mission)}, ${String(vision)}, ${String(purpose)}, now())
          ON CONFLICT (tenant_id) DO UPDATE
            SET mission = EXCLUDED.mission,
                vision  = EXCLUDED.vision,
                purpose = EXCLUDED.purpose,
                updated_at = now()
          RETURNING *`
    );
    res.json((result.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /strategic-goals ────────────────────────────────────────────────────────
router.get("/strategic-goals", async (req, res) => {
  try {
    const tenantId = (req as any).auth?.tenantId ?? null;
    const result = await db.execute(
      sql`SELECT * FROM strategic_goals
          WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`}
          ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /strategic-goals ───────────────────────────────────────────────────────
router.post("/strategic-goals", async (req, res) => {
  try {
    const tenantId = (req as any).auth?.tenantId ?? null;

    // Compute next goal number for this tenant
    const cntResult = await db.execute(
      sql`SELECT COALESCE(MAX(goal_number), 0) + 1 AS next_num
          FROM strategic_goals
          WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`}`
    );
    const nextNum = (cntResult.rows as any[])[0]?.next_num ?? 1;

    const {
      title = '',
      description = '',
      target_date = null,
      status = 'active',
      color = '#6366f1',
    } = req.body as Record<string, any>;

    const result = await db.execute(
      sql`INSERT INTO strategic_goals
            (tenant_id, goal_number, title, description, target_date, status, color)
          VALUES
            (${tenantId}, ${nextNum}, ${String(title)}, ${String(description)},
             ${target_date || null}, ${String(status)}, ${String(color)})
          RETURNING *`
    );
    res.status(201).json((result.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /strategic-goals/:id ─────────────────────────────────────────────────
router.patch("/strategic-goals/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tenantId = (req as any).auth?.tenantId ?? null;
    const {
      title,
      description,
      target_date,
      status,
      color,
    } = req.body as Record<string, any>;

    const result = await db.execute(
      sql`UPDATE strategic_goals
          SET title       = COALESCE(${title !== undefined ? String(title) : null}, title),
              description = COALESCE(${description !== undefined ? String(description) : null}, description),
              target_date = COALESCE(${target_date !== undefined ? (target_date || null) : null}, target_date),
              status      = COALESCE(${status !== undefined ? String(status) : null}, status),
              color       = COALESCE(${color !== undefined ? String(color) : null}, color),
              updated_at  = now()
          WHERE id = ${id}
            AND tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`}
          RETURNING *`
    );
    const row = (result.rows as any[])[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /strategic-goals/:id ────────────────────────────────────────────────
router.delete("/strategic-goals/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tenantId = (req as any).auth?.tenantId ?? null;
    await db.execute(
      sql`DELETE FROM strategic_goals
          WHERE id = ${id}
            AND tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`}`
    );
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as strategyRouter };
