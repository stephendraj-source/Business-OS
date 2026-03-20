import { Router, type IRouter } from "express";
import { db, processesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import multer from "multer";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- Export (must be before /:id) ---
router.get("/processes/export", async (req, res) => {
  try {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number);

    const rows = processes.map(p => ({
      "#": p.number,
      "Category": p.category,
      "Process Name": p.processName,
      "Process Description": p.processDescription,
      "AI Agent": p.aiAgent,
      "Purpose": p.purpose,
      "Inputs": p.inputs,
      "Outputs": p.outputs,
      "Human-in-the-Loop": p.humanInTheLoop,
      "KPI": p.kpi,
      "Target": p.target,
      "Achievement": p.achievement,
      "Estimated Value Impact": p.estimatedValueImpact,
      "Industry Benchmark": p.industryBenchmark,
      "Include": p.included ? "Yes" : "No",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 5 }, { wch: 25 }, { wch: 22 }, { wch: 45 }, { wch: 25 },
      { wch: 40 }, { wch: 35 }, { wch: 35 }, { wch: 30 }, { wch: 35 },
      { wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 45 }, { wch: 8 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Processes");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=nonprofit-processes.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    req.log.error(err, "Failed to export processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Import (must be before /:id) ---
router.post("/processes/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    if (rows.length === 0) {
      res.status(400).json({ error: "Spreadsheet is empty" });
      return;
    }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const num = parseInt(String(row["#"] ?? row["Number"] ?? row["number"] ?? ""), 10);
      if (isNaN(num)) continue;

      const data = {
        number: num,
        category: String(row["Category"] ?? ""),
        processName: String(row["Process Name"] ?? ""),
        processDescription: String(row["Process Description"] ?? ""),
        aiAgent: String(row["AI Agent"] ?? ""),
        purpose: String(row["Purpose"] ?? ""),
        inputs: String(row["Inputs"] ?? ""),
        outputs: String(row["Outputs"] ?? ""),
        humanInTheLoop: String(row["Human-in-the-Loop"] ?? ""),
        kpi: String(row["KPI"] ?? ""),
        target: String(row["Target"] ?? ""),
        achievement: String(row["Achievement"] ?? ""),
        estimatedValueImpact: String(row["Estimated Value Impact"] ?? ""),
        industryBenchmark: String(row["Industry Benchmark"] ?? ""),
        included: String(row["Include"] ?? "").toLowerCase() === "yes",
      };

      const existing = await db.select({ id: processesTable.id })
        .from(processesTable)
        .where(eq(processesTable.number, num))
        .limit(1);

      if (existing.length > 0) {
        await db.update(processesTable).set(data).where(eq(processesTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(processesTable).values(data);
        inserted++;
      }
    }

    res.json({ inserted, updated, total: inserted + updated });
  } catch (err) {
    req.log.error(err, "Failed to import processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- List ---
router.get("/processes", async (req, res) => {
  try {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number);
    res.json(processes);
  } catch (err) {
    req.log.error(err, "Failed to list processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Get by ID ---
router.get("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [process] = await db.select().from(processesTable).where(eq(processesTable.id, id));
    if (!process) { res.status(404).json({ error: "Process not found" }); return; }
    res.json(process);
  } catch (err) {
    req.log.error(err, "Failed to get process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Update ---
router.put("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
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

    const [updated] = await db.update(processesTable).set(updateData).where(eq(processesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Process not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to update process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Delete ---
router.delete("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [deleted] = await db.delete(processesTable).where(eq(processesTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Process not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to delete process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Categories ---
router.get("/categories", async (req, res) => {
  try {
    const rows = await db.selectDistinct({ category: processesTable.category }).from(processesTable).orderBy(processesTable.category);
    res.json(rows.map(r => r.category));
  } catch (err) {
    req.log.error(err, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
