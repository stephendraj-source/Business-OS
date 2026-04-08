import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── List connectors for tenant ────────────────────────────────────────────────
router.get("/connector-configs", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const role = auth?.role ?? "user";
    let rows;
    if (role === "superuser") {
      rows = await db.execute(sql`SELECT * FROM connector_configs ORDER BY created_at ASC`);
    } else {
      rows = await db.execute(sql`SELECT * FROM connector_configs WHERE tenant_id = ${tenantId} ORDER BY created_at ASC`);
    }
    res.json(rows.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create connector ──────────────────────────────────────────────────────────
router.post("/connector-configs", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const { type, name, config, status } = req.body;
    const rows = await db.execute(sql`
      INSERT INTO connector_configs (tenant_id, type, name, config, status)
      VALUES (${tenantId}, ${type}, ${name ?? type}, ${JSON.stringify(config ?? {})}, ${status ?? 'disconnected'})
      RETURNING *
    `);
    res.status(201).json((rows.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update connector ──────────────────────────────────────────────────────────
router.patch("/connector-configs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, config, status } = req.body;
    const existing = await db.execute(sql`SELECT * FROM connector_configs WHERE id = ${id} LIMIT 1`);
    if (!(existing.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    const cur = (existing.rows as any[])[0];
    await db.execute(sql`
      UPDATE connector_configs SET
        name = ${name ?? cur.name},
        config = ${JSON.stringify(config ?? cur.config)},
        status = ${status ?? cur.status},
        updated_at = now()
      WHERE id = ${id}
    `);
    const updated = await db.execute(sql`SELECT * FROM connector_configs WHERE id = ${id} LIMIT 1`);
    res.json((updated.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete connector ──────────────────────────────────────────────────────────
router.delete("/connector-configs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM connector_configs WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Test connector (ping webhook / API) ──────────────────────────────────────
router.post("/connector-configs/:id/test", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.execute(sql`SELECT * FROM connector_configs WHERE id = ${id} LIMIT 1`);
    if (!(rows.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    const connector = (rows.rows as any[])[0];
    const cfg = typeof connector.config === "string" ? JSON.parse(connector.config) : connector.config;

    let testPassed = false;
    let errorMsg = "";

    if (connector.type === "zapier") {
      if (!cfg.webhookUrl) { errorMsg = "Webhook URL required"; }
      else {
        try {
          const r = await fetch(cfg.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ test: true, source: "businessos" }),
            signal: AbortSignal.timeout(8000),
          });
          testPassed = r.ok;
          if (!testPassed) errorMsg = `HTTP ${r.status}`;
        } catch (e: any) { errorMsg = e.message || "Connection failed"; }
      }
    } else if (connector.type === "api") {
      if (!cfg.baseUrl) { errorMsg = "Base URL required"; }
      else {
        try {
          const headers: Record<string, string> = {};
          if (cfg.authType === "bearer") headers["Authorization"] = `Bearer ${cfg.apiKey}`;
          else if (cfg.authType === "apikey") headers[cfg.apiKeyHeader || "X-API-Key"] = cfg.apiKey;
          else if (cfg.authType === "basic") {
            headers["Authorization"] = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
          }
          const r = await fetch(cfg.baseUrl, { method: "GET", headers, signal: AbortSignal.timeout(8000) });
          testPassed = r.ok || r.status < 500;
          if (!testPassed) errorMsg = `HTTP ${r.status}`;
        } catch (e: any) { errorMsg = e.message || "Connection failed"; }
      }
    } else if (connector.type === "mcp") {
      if (!cfg.serverUrl) { errorMsg = "Server URL required"; }
      else {
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
          const r = await fetch(`${cfg.serverUrl.replace(/\/$/, "")}/`, {
            method: "GET", headers, signal: AbortSignal.timeout(8000),
          });
          testPassed = r.ok || r.status < 500;
          if (!testPassed) errorMsg = `HTTP ${r.status}`;
        } catch (e: any) { errorMsg = e.message || "Connection failed"; }
      }
    } else {
      // Salesforce and others — just mark as connected
      testPassed = true;
    }

    const newStatus = testPassed ? "connected" : "error";
    await db.execute(sql`UPDATE connector_configs SET status = ${newStatus}, updated_at = now() WHERE id = ${id}`);
    res.json({ ok: testPassed, status: newStatus, error: errorMsg || null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
