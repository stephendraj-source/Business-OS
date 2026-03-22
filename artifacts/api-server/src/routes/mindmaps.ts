import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── List mindmaps ─────────────────────────────────────────────────────────────
router.get("/mindmaps", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const rows = await db.execute(sql`
      SELECT id, name, folder_id, created_at, updated_at
      FROM mindmaps
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single mindmap (with data) ───────────────────────────────────────────
router.get("/mindmaps/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const rows = await db.execute(sql`
      SELECT * FROM mindmaps WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1
    `);
    if (!(rows.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    res.json((rows.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create mindmap ────────────────────────────────────────────────────────────
router.post("/mindmaps", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const { name, folderId } = req.body;
    const rows = await db.execute(sql`
      INSERT INTO mindmaps (name, tenant_id, folder_id, data)
      VALUES (${name ?? "New Mind Map"}, ${tenantId}, ${folderId ?? null}, ${'{"nodes":[],"edges":[]}'})
      RETURNING *
    `);
    res.status(201).json((rows.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update mindmap ────────────────────────────────────────────────────────────
router.patch("/mindmaps/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const { name, data, folderId } = req.body;

    const existing = await db.execute(sql`
      SELECT * FROM mindmaps WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1
    `);
    if (!(existing.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    const cur = (existing.rows as any[])[0];

    const rows = await db.execute(sql`
      UPDATE mindmaps SET
        name       = ${name       ?? cur.name},
        data       = ${data       ?? cur.data},
        folder_id  = ${folderId !== undefined ? folderId : cur.folder_id},
        updated_at = now()
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING *
    `);
    res.json((rows.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete mindmap ────────────────────────────────────────────────────────────
router.delete("/mindmaps/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    await db.execute(sql`
      DELETE FROM mindmaps WHERE id = ${id} AND tenant_id = ${tenantId}
    `);
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as mindmapsRouter };
