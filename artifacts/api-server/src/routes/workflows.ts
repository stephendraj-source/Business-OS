import { Router, type IRouter } from "express";
import { db, workflowsTable, processLinkedWorkflows, processesTable } from "@workspace/db";
import { eq, max, and } from "drizzle-orm";

const router: IRouter = Router();

function countSteps(steps: any[]): number {
  let n = 0;
  for (const s of steps) {
    n++;
    if (s.thenSteps) n += countSteps(s.thenSteps);
    if (s.elseSteps) n += countSteps(s.elseSteps);
  }
  return n;
}

router.get("/workflows", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const query = db.select().from(workflowsTable);
    const workflows = auth?.tenantId
      ? await query.where(eq(workflowsTable.tenantId, auth.tenantId)).orderBy(workflowsTable.workflowNumber)
      : await query.orderBy(workflowsTable.workflowNumber);
    const withMeta = workflows.map(w => {
      let stepCount = 0;
      try { stepCount = countSteps(JSON.parse(w.steps)); } catch {}
      return { ...w, stepCount };
    });
    res.json(withMeta);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/workflows/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(workflowsTable.id, id), eq(workflowsTable.tenantId, auth.tenantId))
      : eq(workflowsTable.id, id);
    const [w] = await db.select().from(workflowsTable).where(cond);
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workflows", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const tenantCond = tenantId ? eq(workflowsTable.tenantId, tenantId) : undefined;
    const query = db.select({ val: max(workflowsTable.workflowNumber) }).from(workflowsTable);
    const [maxNum] = tenantCond ? await query.where(tenantCond) : await query;
    const nextNum = (maxNum?.val ?? 0) + 1;
    const { name = "New Workflow", description = "", steps = "[]" } = req.body as Record<string, string>;
    const [w] = await db.insert(workflowsTable).values({ workflowNumber: nextNum, name, description, steps, tenantId }).returning();
    res.status(201).json(w);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/workflows/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const { workflowNumber, name, description, steps } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (workflowNumber !== undefined) updates.workflowNumber = Number(workflowNumber);
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (steps !== undefined) updates.steps = typeof steps === "string" ? steps : JSON.stringify(steps);
    const cond = auth?.tenantId
      ? and(eq(workflowsTable.id, id), eq(workflowsTable.tenantId, auth.tenantId))
      : eq(workflowsTable.id, id);
    const [w] = await db.update(workflowsTable).set(updates).where(cond).returning();
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/workflows/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(workflowsTable.id, id), eq(workflowsTable.tenantId, auth.tenantId))
      : eq(workflowsTable.id, id);
    await db.delete(workflowsTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Process Tags ──────────────────────────────────────────────────────────────

router.get("/workflows/:id/processes", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db
      .select({
        id: processesTable.id,
        processName: processesTable.processName,
        category: processesTable.category,
      })
      .from(processLinkedWorkflows)
      .innerJoin(processesTable, eq(processLinkedWorkflows.processId, processesTable.id))
      .where(eq(processLinkedWorkflows.workflowId, id))
      .orderBy(processesTable.category, processesTable.processName);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/workflows/:id/processes", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { processIds = [] } = req.body as { processIds: number[] };
    await db.delete(processLinkedWorkflows).where(eq(processLinkedWorkflows.workflowId, id));
    if (processIds.length > 0) {
      await db.insert(processLinkedWorkflows).values(processIds.map(pid => ({ workflowId: id, processId: pid })));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
