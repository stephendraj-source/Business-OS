import { Router, type IRouter } from "express";
import { db, processesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/processes", async (req, res) => {
  try {
    const processes = await db
      .select()
      .from(processesTable)
      .orderBy(processesTable.number);
    res.json(processes);
  } catch (err) {
    req.log.error(err, "Failed to list processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [process] = await db
      .select()
      .from(processesTable)
      .where(eq(processesTable.id, id));
    if (!process) {
      res.status(404).json({ error: "Process not found" });
      return;
    }
    res.json(process);
  } catch (err) {
    req.log.error(err, "Failed to get process");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = req.body as Record<string, string | boolean>;

    const updateData: Partial<typeof processesTable.$inferInsert> = {};
    if (body.category !== undefined) updateData.category = body.category as string;
    if (body.processDescription !== undefined) updateData.processDescription = body.processDescription as string;
    if (body.processName !== undefined) updateData.processName = body.processName as string;
    if (body.aiAgent !== undefined) updateData.aiAgent = body.aiAgent as string;
    if (body.purpose !== undefined) updateData.purpose = body.purpose as string;
    if (body.inputs !== undefined) updateData.inputs = body.inputs as string;
    if (body.outputs !== undefined) updateData.outputs = body.outputs as string;
    if (body.humanInTheLoop !== undefined) updateData.humanInTheLoop = body.humanInTheLoop as string;
    if (body.kpi !== undefined) updateData.kpi = body.kpi as string;
    if (body.estimatedValueImpact !== undefined) updateData.estimatedValueImpact = body.estimatedValueImpact as string;
    if (body.industryBenchmark !== undefined) updateData.industryBenchmark = body.industryBenchmark as string;
    if (body.included !== undefined) updateData.included = body.included as boolean;
    if (body.target !== undefined) updateData.target = body.target as string;
    if (body.achievement !== undefined) updateData.achievement = body.achievement as string;

    const [updated] = await db
      .update(processesTable)
      .set(updateData)
      .where(eq(processesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Process not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to update process");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(processesTable)
      .where(eq(processesTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Process not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to delete process");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const rows = await db
      .selectDistinct({ category: processesTable.category })
      .from(processesTable)
      .orderBy(processesTable.category);
    res.json(rows.map((r) => r.category));
  } catch (err) {
    req.log.error(err, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
