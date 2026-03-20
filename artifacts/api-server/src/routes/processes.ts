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
    const {
      category,
      processName,
      aiAgent,
      purpose,
      inputs,
      outputs,
      humanInTheLoop,
      kpi,
      estimatedValueImpact,
    } = req.body as Record<string, string>;

    const updateData: Partial<typeof processesTable.$inferInsert> = {};
    if (category !== undefined) updateData.category = category;
    if (processName !== undefined) updateData.processName = processName;
    if (aiAgent !== undefined) updateData.aiAgent = aiAgent;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (inputs !== undefined) updateData.inputs = inputs;
    if (outputs !== undefined) updateData.outputs = outputs;
    if (humanInTheLoop !== undefined) updateData.humanInTheLoop = humanInTheLoop;
    if (kpi !== undefined) updateData.kpi = kpi;
    if (estimatedValueImpact !== undefined)
      updateData.estimatedValueImpact = estimatedValueImpact;

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
