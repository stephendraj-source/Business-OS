import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { workflowsTable } from "@workspace/db";
import { eq, max, desc } from "drizzle-orm";

const router: IRouter = Router();

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/workflows", async (req, res) => {
  try {
    const workflows = await db.select().from(workflowsTable).orderBy(workflowsTable.workflowNumber);
    const withMeta = workflows.map(w => {
      let stepCount = 0;
      try {
        const countSteps = (steps: any[]): number => {
          let n = 0;
          for (const s of steps) {
            n++;
            if (s.thenSteps) n += countSteps(s.thenSteps);
            if (s.elseSteps) n += countSteps(s.elseSteps);
          }
          return n;
        };
        stepCount = countSteps(JSON.parse(w.steps));
      } catch {}
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
    const [w] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, Number(req.params.id)));
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workflows", async (req, res) => {
  try {
    const [maxNum] = await db.select({ val: max(workflowsTable.workflowNumber) }).from(workflowsTable);
    const nextNum = (maxNum?.val ?? 0) + 1;
    const { name = "New Workflow", description = "", steps = "[]" } = req.body as Record<string, string>;
    const [w] = await db.insert(workflowsTable).values({ workflowNumber: nextNum, name, description, steps }).returning();
    res.status(201).json(w);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/workflows/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { workflowNumber, name, description, steps } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (workflowNumber !== undefined) updates.workflowNumber = Number(workflowNumber);
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (steps !== undefined) updates.steps = typeof steps === "string" ? steps : JSON.stringify(steps);
    const [w] = await db.update(workflowsTable).set(updates).where(eq(workflowsTable.id, id)).returning();
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/workflows/:id", async (req, res) => {
  try {
    await db.delete(workflowsTable).where(eq(workflowsTable.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
