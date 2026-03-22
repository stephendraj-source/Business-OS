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

export { router as strategyRouter };
